import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // verify this document belongs to this user
  const { data: doc } = await admin
    .from('documents')
    .select('id, user_id, file_url')
    .eq('id', params.id)
    .eq('user_id', user.id) 
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // delete from storage
  if (doc.file_url) {
    const path = doc.file_url.split('/storage/v1/object/public/documents/')[1]
    if (path) {
      await admin.storage.from('documents').remove([path])
    }
  }

  // delete document row — chunks, sessions, messages cascade automatically
  const { error } = await admin
    .from('documents')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}