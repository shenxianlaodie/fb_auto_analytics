import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Checkbox, DatePicker, Input, InputNumber, Radio, Select, Spin, Typography, message,
} from 'antd';
import dayjs from 'dayjs';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useWizardStore } from './wizardStore';
import { CONVERSION_EVENTS, COUNTRIES, PLATFORM_OPTIONS } from './constants';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => ({ value: 18 + i, label: String(18 + i) }))
  .concat([{ value: 65, label: '65+' }]);

export function AdSetStep() {
  const { accountId } = useAccountStore();
  const { campaign, adset, patchAdset } = useWizardStore();
  const [pixels, setPixels] = useState<{ id: string; name: string }[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [interestOptions, setInterestOptions] = useState<{ id: string; name: string; audienceSize: number | null }[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accountId) return;
    setPixelsLoading(true);
    api.get('/meta/pixels', { params: { accountId } })
      .then((resp) => setPixels(resp.data || []))
      .catch((err) => message.warning(err.response?.data?.error || '像素列表加载失败'))
      .finally(() => setPixelsLoading(false));
  }, [accountId]);

  const searchInterests = (q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.trim().length < 2) return;
    searchTimer.current = setTimeout(async () => {
      setInterestLoading(true);
      try {
        const resp = await api.get('/meta/interests', { params: { q: q.trim() } });
        setInterestOptions(resp.data || []);
      } catch {
        // 忽略搜索失败
      }
      setInterestLoading(false);
    }, 400);
  };

  return (
    <Card title="广告组" style={{ maxWidth: 640 }}>
      <span style={{ ...label, marginTop: 0 }}>广告组名称 *</span>
      <Input
        maxLength={100}
        value={adset.name}
        onChange={(e) => patchAdset({ name: e.target.value })}
      />

      <span style={label}>转化发生位置</span>
      <Typography.Text>网站</Typography.Text>

      <span style={label}>像素 *</span>
      <Select
        style={{ width: '100%' }}
        placeholder="选择 Facebook 像素"
        loading={pixelsLoading}
        value={adset.pixelId}
        onChange={(v) => patchAdset({ pixelId: v })}
        options={pixels.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))}
      />

      <span style={label}>转化事件</span>
      <Select
        style={{ width: 280 }}
        value={adset.conversionEvent}
        onChange={(v) => patchAdset({ conversionEvent: v })}
        options={CONVERSION_EVENTS}
      />

      {!campaign.cboEnabled && (
        <>
          <span style={label}>预算 *</span>
          <Radio.Group
            value={adset.budgetType}
            onChange={(e) => patchAdset({ budgetType: e.target.value })}
            style={{ marginBottom: 8 }}
          >
            <Radio.Button value="daily">日预算</Radio.Button>
            <Radio.Button value="lifetime">总预算</Radio.Button>
          </Radio.Group>
          <br />
          <InputNumber
            min={1} prefix="$" style={{ width: 200 }} placeholder="美元"
            value={adset.budgetUsd}
            onChange={(v) => patchAdset({ budgetUsd: v })}
          />
        </>
      )}

      <span style={label}>排期</span>
      <DatePicker
        showTime
        placeholder="开始时间（默认立即）"
        style={{ width: 240, marginRight: 12 }}
        value={adset.startTime ? dayjs(adset.startTime) : null}
        onChange={(d) => patchAdset({ startTime: d ? d.toISOString() : null })}
      />
      <DatePicker
        showTime
        placeholder="结束时间（可选）"
        style={{ width: 240 }}
        value={adset.endTime ? dayjs(adset.endTime) : null}
        onChange={(d) => patchAdset({ endTime: d ? d.toISOString() : null })}
      />

      <span style={label}>地区 *</span>
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        optionFilterProp="label"
        placeholder="选择投放国家/地区"
        value={adset.countries}
        onChange={(v) => patchAdset({ countries: v })}
        options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
      />

      <span style={label}>年龄</span>
      <Select
        style={{ width: 100 }}
        value={adset.ageMin}
        onChange={(v) => patchAdset({ ageMin: v })}
        options={AGE_OPTIONS}
      />
      <span style={{ margin: '0 8px' }}>至</span>
      <Select
        style={{ width: 100 }}
        value={adset.ageMax}
        onChange={(v) => patchAdset({ ageMax: v })}
        options={AGE_OPTIONS}
      />

      <span style={label}>性别</span>
      <Radio.Group value={adset.gender} onChange={(e) => patchAdset({ gender: e.target.value })}>
        <Radio.Button value="all">全部</Radio.Button>
        <Radio.Button value="male">男</Radio.Button>
        <Radio.Button value="female">女</Radio.Button>
      </Radio.Group>

      <span style={label}>兴趣定向（可选）</span>
      <Select
        mode="multiple"
        labelInValue
        style={{ width: '100%' }}
        placeholder="搜索兴趣关键词（至少 2 个字符）"
        filterOption={false}
        onSearch={searchInterests}
        notFoundContent={interestLoading ? <Spin size="small" /> : '输入关键词搜索'}
        value={adset.interests.map((i) => ({ value: i.id, label: i.name }))}
        onChange={(vals: { value: string; label: React.ReactNode }[]) =>
          patchAdset({
            interests: vals.map((v) => {
              const found = interestOptions.find((o) => o.id === v.value);
              const prev = adset.interests.find((i) => i.id === v.value);
              return { id: v.value, name: found?.name || prev?.name || String(v.label) };
            }),
          })
        }
        options={interestOptions.map((o) => ({
          value: o.id,
          label: o.audienceSize ? `${o.name}（受众约 ${(o.audienceSize / 1e6).toFixed(1)}M）` : o.name,
        }))}
      />

      <span style={label}>版位</span>
      <Radio.Group
        value={adset.placementMode}
        onChange={(e) => patchAdset({ placementMode: e.target.value })}
      >
        <Radio value="auto">优势版位（自动，推荐）</Radio>
        <Radio value="manual">手动版位</Radio>
      </Radio.Group>
      {adset.placementMode === 'manual' && (
        <div style={{ marginTop: 8 }}>
          <Checkbox.Group
            options={PLATFORM_OPTIONS}
            value={adset.platforms}
            onChange={(v) => patchAdset({ platforms: v as string[] })}
          />
        </div>
      )}
    </Card>
  );
}
