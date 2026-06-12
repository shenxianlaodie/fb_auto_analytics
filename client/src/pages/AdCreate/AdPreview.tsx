import React from 'react';
import { Button, Card, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import type { WizardAd } from './wizardStore';
import { CTA_OPTIONS } from './constants';

/** 模拟 FB 移动端 Feed 帖子的实时预览 */
export function AdPreview({ ad, pageName }: { ad: WizardAd; pageName: string | null }) {
  const ctaLabel = CTA_OPTIONS.find((c) => c.value === ad.cta)?.label || ad.cta;
  const mediaUrl = ad.format === 'image' ? ad.imagePreviewUrl : ad.thumbnailPreviewUrl;
  let domain = '';
  try {
    if (ad.linkUrl) domain = new URL(ad.linkUrl).hostname.toUpperCase();
  } catch {
    // 链接未填完整时忽略
  }

  return (
    <Card title="广告预览（移动端 Feed）" style={{ width: 360 }}>
      <div style={{ border: '1px solid #e4e6eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#1877f2',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>
            {(pageName || 'P').slice(0, 1)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pageName || '选择主页'}</div>
            <div style={{ fontSize: 12, color: '#65676b' }}>
              赞助内容 · <GlobalOutlined />
            </div>
          </div>
        </div>

        {ad.primaryText && (
          <div style={{ padding: '0 12px 8px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {ad.primaryText}
          </div>
        )}

        <div style={{ background: '#f0f2f5', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {mediaUrl ? (
            <img src={mediaUrl} alt="creative" style={{ width: '100%', display: 'block' }} />
          ) : (
            <Typography.Text type="secondary">
              {ad.format === 'video' ? '上传视频缩略图后显示' : '上传图片后显示'}
            </Typography.Text>
          )}
        </div>

        <div style={{
          background: '#f0f2f5', padding: 12, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#65676b' }}>{domain || 'EXAMPLE.COM'}</div>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ad.headline || '广告标题'}
            </div>
            {ad.description && (
              <div style={{ fontSize: 12, color: '#65676b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ad.description}
              </div>
            )}
          </div>
          <Button size="small">{ctaLabel}</Button>
        </div>
      </div>
    </Card>
  );
}
