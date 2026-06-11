import React, { useState } from 'react';
import { Card, Col, Input, Radio, Row, Select, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useWizardStore } from './wizardStore';
import { CTA_OPTIONS } from './constants';
import { AdPreview } from './AdPreview';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

export interface FbPage { id: string; name: string; pictureUrl: string | null }

export function AdStep({ pages, pagesLoading }: { pages: FbPage[]; pagesLoading: boolean }) {
  const { accountId } = useAccountStore();
  const { ad, patchAd } = useWizardStore();
  const [uploading, setUploading] = useState(false);

  const uploadMedia = async (
    file: File,
    kind: 'image' | 'video' | 'thumbnail',
  ) => {
    if (!accountId) return;
    setUploading(true);
    const form = new FormData();
    const field = kind === 'video' ? 'video' : 'image';
    form.append(field, file);
    form.append('accountId', accountId);
    try {
      const resp = await api.post(`/upload/${field}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const previewUrl = URL.createObjectURL(file);
      if (kind === 'image') {
        patchAd({ imageHash: resp.data.hash, imagePreviewUrl: previewUrl });
      } else if (kind === 'video') {
        patchAd({ videoId: resp.data.videoId });
      } else {
        patchAd({ thumbnailHash: resp.data.hash, thumbnailPreviewUrl: previewUrl });
      }
      message.success('上传成功');
    } catch (err: any) {
      message.error(err.response?.data?.error || '上传失败');
    }
    setUploading(false);
  };

  const dragger = (kind: 'image' | 'video' | 'thumbnail', hint: string, done: boolean) => (
    <Upload.Dragger
      accept={kind === 'video' ? '.mp4,.mov,.avi' : '.jpg,.jpeg,.png,.gif'}
      showUploadList={false}
      disabled={uploading}
      customRequest={({ file }) => uploadMedia(file as File, kind)}
      style={{ marginBottom: 8 }}
    >
      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
      <p className="ant-upload-text">{done ? '已上传，点击可替换' : hint}</p>
    </Upload.Dragger>
  );

  const selectedPage = pages.find((p) => p.id === ad.pageId) || null;

  return (
    <Row gutter={24}>
      <Col flex="auto">
        <Card title="广告" style={{ maxWidth: 640 }}>
          <span style={{ ...label, marginTop: 0 }}>广告名称 *</span>
          <Input maxLength={100} value={ad.name} onChange={(e) => patchAd({ name: e.target.value })} />

          <span style={label}>身份（Facebook 主页）*</span>
          <Select
            style={{ width: '100%' }}
            placeholder="选择发布主页"
            loading={pagesLoading}
            value={ad.pageId}
            onChange={(v) => patchAd({ pageId: v })}
            options={pages.map((p) => ({ value: p.id, label: p.name }))}
          />

          <span style={label}>广告格式</span>
          <Radio.Group
            value={ad.format}
            onChange={(e) => patchAd({ format: e.target.value })}
          >
            <Radio.Button value="image">单图片</Radio.Button>
            <Radio.Button value="video">视频</Radio.Button>
          </Radio.Group>

          <span style={label}>素材 *</span>
          {ad.format === 'image' ? (
            dragger('image', '点击或拖拽上传图片（jpg/png/gif，≤50MB）', !!ad.imageHash)
          ) : (
            <>
              {dragger('video', '点击或拖拽上传视频（mp4/mov，≤50MB）', !!ad.videoId)}
              <span style={{ ...label, marginTop: 8 }}>视频缩略图 *</span>
              {dragger('thumbnail', '上传视频封面图片', !!ad.thumbnailHash)}
            </>
          )}

          <span style={label}>主要文本 *</span>
          <Input.TextArea
            rows={3} maxLength={500} showCount
            value={ad.primaryText}
            onChange={(e) => patchAd({ primaryText: e.target.value })}
          />

          <span style={label}>标题 *</span>
          <Input maxLength={60} showCount value={ad.headline}
            onChange={(e) => patchAd({ headline: e.target.value })} />

          <span style={label}>描述（可选）</span>
          <Input maxLength={100} value={ad.description}
            onChange={(e) => patchAd({ description: e.target.value })} />

          <span style={label}>行动号召（CTA）</span>
          <Select style={{ width: 240 }} value={ad.cta}
            onChange={(v) => patchAd({ cta: v })} options={CTA_OPTIONS} />

          <span style={label}>落地页链接 *</span>
          <Input placeholder="https://..." value={ad.linkUrl}
            onChange={(e) => patchAd({ linkUrl: e.target.value })} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            建议带 UTM 参数（utm_content 填广告编号可自动归因）
          </Typography.Text>
        </Card>
      </Col>
      <Col flex="360px">
        <AdPreview ad={ad} pageName={selectedPage?.name || null} />
      </Col>
    </Row>
  );
}
