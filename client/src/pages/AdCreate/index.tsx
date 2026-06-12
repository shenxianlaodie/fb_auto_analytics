import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Modal, Result, Steps, Typography, message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import {
  buildDraftPayload, buildPublishBody, useWizardStore, validateStep,
} from './wizardStore';
import { CampaignStep } from './CampaignStep';
import { AdSetStep } from './AdSetStep';
import { AdStep, FbPage } from './AdStep';

interface LevelResult { success: boolean; id?: string; error?: string }
interface PublishResult { campaign: LevelResult; adset: LevelResult; ad: LevelResult }

export const AdCreate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accountId, accountName } = useAccountStore();
  const store = useWizardStore();
  const { step, setStep, draftId, setDraftId, campaign, adset, ad, reset, loadDraft } = store;

  const [errors, setErrors] = useState<string[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPaused, setPublishPaused] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);

  useEffect(() => {
    const qDraftId = searchParams.get('draftId');
    if (qDraftId) {
      api.get(`/drafts/${qDraftId}`)
        .then((resp) => loadDraft(qDraftId, resp.data.payload))
        .catch(() => message.warning('草稿不存在或已删除'));
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPagesLoading(true);
    api.get('/meta/pages')
      .then((resp) => setPages(resp.data || []))
      .catch((err) => message.warning(err.response?.data?.error || '主页列表加载失败'))
      .finally(() => setPagesLoading(false));
  }, []);

  const goNext = () => {
    const errs = validateStep(step, { campaign, adset, ad });
    setErrors(errs);
    if (errs.length === 0) setStep(step + 1);
  };

  const handleSaveDraft = async () => {
    if (!accountId) return;
    setSavingDraft(true);
    try {
      const name = campaign.name.trim() || '未命名草稿';
      const payload = buildDraftPayload({ step, campaign, adset, ad });
      if (draftId) {
        await api.put(`/drafts/${draftId}`, { name, payload });
      } else {
        const resp = await api.post('/drafts', { accountId, name, payload });
        setDraftId(resp.data.id);
      }
      message.success('草稿已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '草稿保存失败');
    }
    setSavingDraft(false);
  };

  const openPublish = () => {
    const allErrs = [0, 1, 2].flatMap((s) => validateStep(s, { campaign, adset, ad }));
    setErrors(allErrs);
    if (allErrs.length === 0) setPublishOpen(true);
  };

  const handlePublish = async () => {
    if (!accountId) return;
    setPublishing(true);
    try {
      const body = buildPublishBody(accountId, { campaign, adset, ad }, publishPaused);
      const resp = await api.post('/publish', body);
      const result: PublishResult = resp.data;
      setPublishResult(result);
      if (result.ad.success && draftId) {
        await api.delete(`/drafts/${draftId}`).catch(() => {});
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '发布失败');
    }
    setPublishing(false);
    setPublishOpen(false);
  };

  if (!accountId) {
    return <Alert type="warning" showIcon message="请先在顶部选择广告账户" />;
  }

  if (publishResult) {
    const allOk = publishResult.campaign.success && publishResult.adset.success && publishResult.ad.success;
    const levelLine = (name: string, r: LevelResult) =>
      `${name}：${r.success ? `成功（${r.id}）` : `失败 — ${r.error || '未知错误'}`}`;
    return (
      <Result
        status={allOk ? 'success' : 'warning'}
        title={allOk ? '发布成功' : '部分发布失败'}
        subTitle={
          <div style={{ textAlign: 'left', display: 'inline-block' }}>
            <div>{levelLine('广告系列', publishResult.campaign)}</div>
            <div>{levelLine('广告组', publishResult.adset)}</div>
            <div>{levelLine('广告', publishResult.ad)}</div>
            {!allOk && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
                已创建的层级以{publishPaused ? '暂停' : '原'}状态保留在 Facebook，可在广告管理中继续编辑。
              </Typography.Paragraph>
            )}
          </div>
        }
        extra={[
          <Button type="primary" key="back" onClick={() => { reset(); navigate('/ads'); }}>
            返回广告管理
          </Button>,
          !allOk && (
            <Button key="retry" onClick={() => setPublishResult(null)}>
              返回向导修改
            </Button>
          ),
        ]}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ads')}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          创建广告 — {accountName || accountId}
        </Typography.Title>
        {draftId && <Typography.Text type="secondary">（草稿编辑中）</Typography.Text>}
      </div>

      <div style={{ display: 'flex', gap: 32 }}>
        <Steps
          direction="vertical"
          size="small"
          current={step}
          onChange={(s) => { if (s < step) setStep(s); }}
          style={{ width: 180, flexShrink: 0 }}
          items={[
            { title: '广告系列', description: '名称与预算优化' },
            { title: '广告组', description: '受众·预算·版位' },
            { title: '广告', description: '创意与文案' },
          ]}
        />
        <div style={{ flex: 1 }}>
          {errors.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginBottom: 16 }} message="请完善以下内容"
              description={<ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            />
          )}
          {step === 0 && <CampaignStep />}
          {step === 1 && <AdSetStep />}
          {step === 2 && <AdStep pages={pages} pagesLoading={pagesLoading} />}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={savingDraft}>
              保存草稿
            </Button>
            <div style={{ flex: 1 }} />
            {step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}
            {step < 2 && <Button type="primary" onClick={goNext}>下一步</Button>}
            {step === 2 && (
              <Button type="primary" icon={<SendOutlined />} onClick={openPublish}>
                发布
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        title="确认发布"
        open={publishOpen}
        onOk={handlePublish}
        onCancel={() => setPublishOpen(false)}
        confirmLoading={publishing}
        okText="确认发布"
      >
        <Typography.Paragraph>
          将在账户 <b>{accountName || accountId}</b> 创建：
        </Typography.Paragraph>
        <ul>
          <li>广告系列：{campaign.name}</li>
          <li>广告组：{adset.name}</li>
          <li>广告：{ad.name}</li>
        </ul>
        <Checkbox checked={publishPaused} onChange={(e) => setPublishPaused(e.target.checked)}>
          以暂停状态发布（推荐，确认无误后再开启投放）
        </Checkbox>
      </Modal>
    </div>
  );
};
