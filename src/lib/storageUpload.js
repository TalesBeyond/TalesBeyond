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

// REQ-009 Synced Table Audio. The bucket (38_synced_table_audio.sql) enforces
// the same limit and MIME allow-list server-side; this is the friendly check.
export const AUDIO_BUCKET = 'table-audio';
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' };

// Returns an error message, or null when the file is an acceptable MP3/WAV.
export function validateAudioFile(file) {
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const typeOk = Boolean(AUDIO_TYPES[file.type]) || (!file.type && (ext === 'mp3' || ext === 'wav'));
  if (!typeOk) return 'Only MP3 or WAV files are supported.';
  if (file.size > AUDIO_MAX_BYTES) return `That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB.`;
  return null;
}

/**
 * Uploads an audio file to `table-audio/${tableId}/...` and returns what a
 * track record needs. Host-only (enforced by the bucket's insert policy).
 */
export async function uploadAudio(file, tableId) {
  const error = validateAudioFile(file);
  if (error) throw new Error(error);
  const mime = AUDIO_TYPES[file.type] ? file.type : file.name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
  const path = `${tableId}/${randomFileName(AUDIO_TYPES[mime])}`;
  const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) throw new Error(`upload to ${AUDIO_BUCKET}: ${uploadError.message}`);
  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, storagePath: path, mime, sizeBytes: file.size };
}

export async function removeAudioFile(storagePath) {
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
  if (error) console.error('removeAudioFile:', error.message);
}

const TABLE_STORAGE_BUCKETS = ['token-art', 'map-backgrounds', AUDIO_BUCKET];
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
