import React from 'react';
import { Card, Input, InputNumber, Radio, Switch, Tag, Typography } from 'antd';
import { useWizardStore } from './wizardStore';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

export function CampaignStep() {
  const { campaign, patchCampaign } = useWizardStore();

  return (
    <Card title="广告系列" style={{ maxWidth: 640 }}>
      <span style={{ ...label, marginTop: 0 }}>系列名称 *</span>
      <Input
        maxLength={100}
        placeholder="例如：2026夏季新品-转化"
        value={campaign.name}
        onChange={(e) => patchCampaign({ name: e.target.value })}
      />

      <span style={label}>营销目标</span>
      <Tag color="blue">销售（转化）</Tag>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>本系统固定为销售目标</Typography.Text>

      <span style={label}>购买类型</span>
      <Tag>竞拍</Tag>

      <span style={label}>预算优化（CBO）</span>
      <Switch
        checked={campaign.cboEnabled}
        onChange={(v) => patchCampaign({ cboEnabled: v })}
        checkedChildren="开" unCheckedChildren="关"
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        开启后在系列层统一分配预算；关闭则在广告组层设置预算。
      </Typography.Paragraph>

      {campaign.cboEnabled && (
        <>
          <span style={label}>系列预算 *</span>
          <Radio.Group
            value={campaign.budgetType}
            onChange={(e) => patchCampaign({ budgetType: e.target.value })}
            style={{ marginBottom: 8 }}
          >
            <Radio.Button value="daily">日预算</Radio.Button>
            <Radio.Button value="lifetime">总预算</Radio.Button>
          </Radio.Group>
          <br />
          <InputNumber
            min={1}
            prefix="$"
            style={{ width: 200 }}
            placeholder="美元"
            value={campaign.budgetUsd}
            onChange={(v) => patchCampaign({ budgetUsd: v })}
          />
        </>
      )}
    </Card>
  );
}
