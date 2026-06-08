/** 从 effective_object_story_id（格式 pageId_postId）提取帖子 ID */
export function extractPostIdFromStory(storyId?: string | null): string | null {
  if (!storyId) return null;
  const trimmed = storyId.trim();
  const idx = trimmed.lastIndexOf('_');
  if (idx >= 0 && idx < trimmed.length - 1) {
    return trimmed.slice(idx + 1);
  }
  return trimmed;
}

export function resolveStoryId(creative?: { effective_object_story_id?: string; object_story_id?: string }): string | null {
  if (!creative) return null;
  return creative.effective_object_story_id || creative.object_story_id || null;
}

/** 生成用于 UTM 匹配的候选键（帖子 ID、完整 story ID） */
export function postIdMatchKeys(postId: string | null, storyId: string | null): string[] {
  const keys = new Set<string>();
  const add = (v?: string | null) => {
    if (!v) return;
    keys.add(v.trim().toLowerCase());
  };
  add(postId);
  add(storyId);
  const extracted = extractPostIdFromStory(storyId);
  add(extracted);
  return [...keys];
}

export function utmValueMatchesPostKeys(utmValue: string, keys: string[]): boolean {
  const normalized = utmValue.trim().toLowerCase();
  if (!normalized) return false;
  return keys.some((key) => key === normalized || normalized.includes(key) || key.includes(normalized));
}
