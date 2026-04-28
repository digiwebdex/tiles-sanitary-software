/**
 * Image upload helper — posts a File to the VPS uploads endpoint and
 * returns the public URL to store in the product row.
 *
 * Uses the VPS access token (same auth as data routes) but bypasses the
 * JSON-only `vpsAuthedFetch` so multipart boundaries are preserved.
 */
import { env } from "@/lib/env";
import { vpsTokenStore } from "@/lib/vpsAuthClient";

export interface UploadResult {
  url: string; // relative path served by the API host (e.g. /uploads/products/<dealer>/<file>)
  fullUrl: string; // absolute URL, ready for <img src>
}

export async function uploadProductImage(file: File): Promise<UploadResult> {
  if (!file) throw new Error("No file provided");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be ≤ 5 MB");
  }

  const fd = new FormData();
  fd.append("file", file);

  const headers: Record<string, string> = {};
  const access = vpsTokenStore.access;
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${env.VPS_API_BASE}/api/uploads/product-image`, {
    method: "POST",
    headers,
    body: fd,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Upload failed (${res.status})`);
  }

  return {
    url: body.url as string,
    fullUrl: `${env.VPS_API_BASE}${body.url}`,
  };
}

/** Convert a stored image_url into something usable in <img src>. */
export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${env.VPS_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}
