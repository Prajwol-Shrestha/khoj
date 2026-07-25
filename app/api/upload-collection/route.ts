import { chunkText } from '@/lib/chunker'
import { extractText, isSupportedType, SUPPORTED_EXTENSIONS } from '@/lib/extractor'
import { embedBatch } from '@/lib/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const MAX_FILES = 3

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const supabase = createAdminClient()

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const sessionToken = formData.get('sessionToken') as string | null

    // validate file count
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed per collection` },
        { status: 400 }
      )
    }

    // validate all files before processing any
    for (const file of files) {
      if (!isSupportedType(file.type)) {
        return NextResponse.json(
          { error: `${file.name}: Unsupported type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` },
          { status: 400 }
        )
      }
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json(
          { error: `${file.name}: File too large. Max 20MB.` },
          { status: 413 }
        )
      }
    }

    const { data: { user } } = await authClient.auth.getUser()

    // create collection with auto-generated title
    const collectionTitle = files.length === 1
      ? files[0].name.replace(/\.(pdf|txt|md|docx)$/i, '')
      : `${files[0].name.replace(/\.(pdf|txt|md|docx)$/i, '')} + ${files.length - 1} more`

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .insert({
        user_id: user?.id ?? null,
        session_token: user ? null : sessionToken,
        title: collectionTitle,
      })
      .select()
      .single()

    if (collectionError) throw new Error(`Collection error: ${collectionError.message}`)

    // process each file
    const documentIds: string[] = []

    for (const file of files) {
      const fileBuffer = await file.arrayBuffer()
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const storagePath = user
        ? `${user.id}/${fileName}`
        : `guest/${sessionToken}/${fileName}`

      // upload to storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, fileBuffer, { contentType: file.type })

      if (storageError) throw new Error(`Storage error for ${file.name}: ${storageError.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath)

      // create document row
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user?.id ?? null,
          session_token: user ? null : sessionToken,
          title: file.name.replace(/\.(pdf|txt|md|docx)$/i, ''),
          file_name: file.name,
          file_url: publicUrl,
          status: 'processing',
        })
        .select()
        .single()

      if (docError) throw new Error(`Document error for ${file.name}: ${docError.message}`)

      // extract + chunk + embed
      const { text: rawText, pageCount = 1 } = await extractText(
        Buffer.from(fileBuffer),
        file.type as any
      )

      if (!rawText || rawText.trim().length === 0) {
        await supabase.from('documents').update({ status: 'error' }).eq('id', document.id)
        throw new Error(`Could not extract text from ${file.name}`)
      }

      const chunks = chunkText(rawText)
      const embeddings = await embedBatch(chunks)

      const chunkRows = chunks.map((content, index) => ({
        document_id: document.id,
        content,
        chunk_index: index,
        embedding: JSON.stringify(embeddings[index]),
      }))

      await supabase.from('chunks').insert(chunkRows)

      await supabase
        .from('documents')
        .update({ status: 'ready', page_count: pageCount, chunk_count: chunks.length })
        .eq('id', document.id)

      // link document to collection
      await supabase.from('collection_documents').insert({
        collection_id: collection.id,
        document_id: document.id,
      })

      documentIds.push(document.id)
    }

    // create one chat session for the whole collection
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        collection_id: collection.id,
        document_id: null,
        user_id: user?.id ?? null,
        session_token: user ? null : sessionToken,
        title: collectionTitle,
      })
      .select()
      .single()

    if (sessionError) throw new Error(`Session error: ${sessionError.message}`)

    return NextResponse.json({
      success: true,
      collectionId: collection.id,
      sessionId: session.id,
      documentCount: documentIds.length,
    })

  } catch (error) {
    console.error('Collection upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}