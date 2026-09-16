// Storage (SPEC.md §9.6). Resizes an image client-side before upload so a
// phone photo doesn't become a multi-megabyte token portrait, then uploads
// it into a per-table folder (enforced by the RLS policies in
// supabase/04_storage.sql) and returns a public URL — a drop-in
// replacement for the base64 data URLs Phase 1 stores directly in state.

import { supabase } from './supabaseClient.js';
import { resizeImageToCanvas } from '../utils/image.js';

function resizeImageFile(file, maxDim) {
  return resizeImageToCanvas(file, maxDim).then(
    (canvas) =>
      new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/webp', 0.9);
      })
  );
}

function randomFileName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

/**
 * @param {File} file - user-selected image file
 * @param {'token-art' | 'map-backgrounds'} bucket
 * @param {string} tableId - scopes the upload path per storage policy
 * @param {number} maxDim - longest edge in pixels after resizing
 */
export async function uploadImage(file, bucket, tableId, maxDim = 512) {
  const blob = await resizeImageFile(file, maxDim);
  const path = `${tableId}/${randomFileName('webp')}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw new Error(`upload to ${bucket}: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

const TABLE_STORAGE_BUCKETS = ['token-art', 'map-backgrounds'];
const STORAGE_LIST_PAGE_SIZE = 100; // Supabase Storage's own default page size

// Pages through every object under `${tableId}/` in one bucket — `.list()`
// alone only returns the first page (100 objects by default), and once
// delete_table has run, the DELETE policy authorizing removal can no
// longer find the table (see deleteTableStorage below), permanently
// stranding anything left unlisted.
async function listAllTableFiles(bucket, tableId) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data: files, error } = await supabase.storage.from(bucket).list(tableId, { limit: STORAGE_LIST_PAGE_SIZE, offset });
    if (error) {
      console.error(`deleteTableStorage list(${bucket}):`, error.message);
      return all;
    }
    all.push(...(files || []));
    if (!files || files.length < STORAGE_LIST_PAGE_SIZE) return all;
    offset += STORAGE_LIST_PAGE_SIZE;
  }
}

// Best-effort cleanup of a table's uploaded images (REQ-007) — must run
// BEFORE deleteTableRemote, since the RLS policy authorizing this delete
// depends on the table's row still existing (supabase/migrations/
// 20250101000027_host_table_cap_hardening.sql). Failures are swallowed:
// an orphaned file left behind is the same outcome as never attempting
// cleanup, and is never worth blocking the table deletion itself over.
export async function deleteTableStorage(tableId) {
  for (const bucket of TABLE_STORAGE_BUCKETS) {
    try {
      const files = await listAllTableFiles(bucket, tableId);
      if (!files.length) continue;
      const paths = files.map((file) => `${tableId}/${file.name}`);
      const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
      if (removeError) console.error(`deleteTableStorage remove(${bucket}):`, removeError.message);
    } catch (err) {
      console.error(`deleteTableStorage(${bucket}):`, err);
    }
  }
}
