import { createAdminClient } from '@/lib/supabase/admin'
import { embedQuery } from '@/lib/gemini'
import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { question, sessionId } = await req.json()

    if (!question || !sessionId) {
      return NextResponse.json(
        { error: 'question and sessionId are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 1. get the session + document
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, document_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 2. save user message
    await supabase.from('messages').insert({
      session_id: sessionId,
      role: 'user',
      content: question,
    })

    // 3. embed the question
    const questionEmbedding = await embedQuery(question)

    // 4. vector search — find top 3 relevant chunks
    const { data: chunks, error: searchError } = await supabase.rpc(
      'match_chunks',
      {
        query_embedding: questionEmbedding,
        match_document_id: session.document_id,
        match_count: 3,
      }
    )

    if (searchError) throw new Error(`Search error: ${searchError.message}`)

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ error: 'No relevant content found' }, { status: 404 })
    }

    // 5. build context from chunks
    const context = chunks
      .map((c: any, i: number) => `[Chunk ${i + 1}]:\n${c.content}`)
      .join('\n\n')

    // 6. build the prompt
    const prompt = `You are a helpful assistant that answers questions based strictly on the provided document context.
If the answer is not in the context, say "I couldn't find that information in the document."
Do not make up information. Be concise and clear.

Context from document:
${context}

Question: ${question}

Answer:`

    // 7. get answer from Groq
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3, // lower = more factual, less creative
    })

    const answer = completion.choices[0].message.content ?? 'No response generated'
    const tokensUsed = completion.usage?.total_tokens ?? 0

    // 8. save assistant message with source chunks
    await supabase.from('messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: answer,
      source_chunks: chunks.map((c: any) => ({
        id: c.id,
        content: c.content,
        similarity: c.similarity,
      })),
      tokens_used: tokensUsed,
    })

    return NextResponse.json({
      answer,
      sources: chunks.map((c: any) => ({
        content: c.content,
        similarity: Math.round(c.similarity * 100) / 100,
      })),
      tokensUsed,
    })

  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    )
  }
}