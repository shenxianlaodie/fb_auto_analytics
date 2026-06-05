import React, { useState, useRef } from 'react';
import {
  Typography, Button, Steps, Upload, Card, Progress, Table,
  Space, Alert, message, Result, Tag,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useBatchPublish } from '../hooks/useBatchPublish';
import { BatchJobResult } from '../types/facebook';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

export const BatchPublish: React.FC = () => {
  const { jobStatus, loading, error, downloadTemplate, uploadCSV } = useBatchPublish();
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      message.loading('下载模板中...', 0.5);
      await downloadTemplate();
      message.success('模板下载成功');
    } catch {
      message.error('模板下载失败');
    }
  };

  const handleUpload = async (file: File) => {
    setUploadedFile(file);
    try {
      await uploadCSV(file);
      setCurrentStep(2); // Processing
    } catch {
      message.error('上传失败，请检查文件格式');
    }
    return false; // Prevent default upload behavior
  };

  const resultColumns: ColumnsType<BatchJobResult> = [
    {
      title: '#',
      dataIndex: 'row',
      key: 'row',
      width: 50,
    },
    {
      title: '广告名称',
      dataIndex: 'adName',
      key: 'adName',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        status === 'success' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
        )
      ),
    },
    {
      title: '广告 ID / 错误信息',
      dataIndex: 'status',
      key: 'detail',
      width: 250,
      render: (_: string, record: BatchJobResult) => (
        record.status === 'success' ? (
          <Text code>{record.adId}</Text>
        ) : (
          <Text type="danger" style={{ fontSize: 12 }}>{record.error}</Text>
        )
      ),
    },
  ];

  const isCompleted = jobStatus?.status === 'completed';
  const isFailed = jobStatus?.status === 'failed';
  const isProcessing = jobStatus?.status === 'processing' || (loading && currentStep === 2);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>📦 批量发布广告</Title>

      <Steps
        current={currentStep}
        items={[
          { title: '下载模板', description: '获取 CSV 模板文件' },
          { title: '填写并上传', description: '填写广告信息并上传' },
          { title: '自动发布', description: '系统逐条创建广告' },
          { title: '完成', description: '查看发布结果' },
        ]}
        style={{ marginBottom: 32 }}
      />

      {error && (
        <Alert type="error" message={error} showIcon closable style={{ marginBottom: 16 }} />
      )}

      {/* Step 0: Download Template */}
      {currentStep === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <DownloadOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
            <Title level={5}>Step 1: 下载 CSV 模板</Title>
            <Paragraph type="secondary">
              模板包含所有必填字段及示例数据。请使用 Excel 或 Google Sheets 编辑，
              保存为 CSV 格式（UTF-8 编码）。
            </Paragraph>

            <Space direction="vertical" style={{ marginTop: 16 }}>
              <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                下载 CSV 模板
              </Button>
            </Space>

            <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 600, margin: '24px auto 0' }}>
              <Text strong>模板字段说明：</Text>
              <table style={{ width: '100%', marginTop: 8, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '6px 12px', textAlign: 'left' }}>字段</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left' }}>说明</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left' }}>必填</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['campaign_name', '广告系列名称', '是'],
                    ['adset_name', '广告组名称', '是'],
                    ['ad_name', '广告名称', '是'],
                    ['targeting_age_min', '最小年龄', '是'],
                    ['targeting_age_max', '最大年龄', '是'],
                    ['targeting_gender', '性别: all/male/female', '否'],
                    ['targeting_interests', '兴趣（逗号分隔）', '否'],
                    ['budget_daily', '日预算（美分）', '是'],
                    ['headline', '广告标题', '是'],
                    ['body_text', '广告正文', '否'],
                    ['cta', '行动号召按钮', '是'],
                    ['link', '目标 URL', '是'],
                    ['image_url', '图片 URL', '是'],
                  ].map(([field, desc, required]) => (
                    <tr key={field}>
                      <td style={{ padding: '4px 12px' }}><Text code>{field}</Text></td>
                      <td style={{ padding: '4px 12px' }}>{desc}</td>
                      <td style={{ padding: '4px 12px' }}>
                        <Tag color={required === '是' ? 'red' : 'default'}>{required}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              type="primary"
              style={{ marginTop: 24 }}
              onClick={() => setCurrentStep(1)}
            >
              已准备好模板，开始上传
            </Button>
          </div>
        </Card>
      )}

      {/* Step 1: Upload CSV */}
      {currentStep === 1 && (
        <Card>
          <Dragger
            accept=".csv"
            maxCount={1}
            beforeUpload={(file) => {
              handleUpload(file);
              return false;
            }}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
            <p className="ant-upload-hint">支持 .csv 格式，最大 10MB，最多 100 条广告</p>
          </Dragger>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button onClick={() => setCurrentStep(0)}>返回下载模板</Button>
          </div>
        </Card>
      )}

      {/* Step 2-3: Processing & Results */}
      {(currentStep === 2 || isCompleted || isFailed) && (
        <Card>
          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Title level={5}>正在批量发布广告...</Title>
              <Progress
                percent={jobStatus?.progress || 0}
                status="active"
                style={{ maxWidth: 400, margin: '16px auto' }}
              />
              <Paragraph type="secondary">
                已完成 {jobStatus?.successCount || 0} / {jobStatus?.totalCount || 0} 条
                {jobStatus?.failedCount ? `，${jobStatus.failedCount} 条失败` : ''}
              </Paragraph>
            </div>
          )}

          {isCompleted && (
            <Result
              status="success"
              title="批量发布完成！"
              subTitle={`成功 ${jobStatus.successCount} 条，失败 ${jobStatus.failedCount} 条，共 ${jobStatus.totalCount} 条广告`}
              extra={[
                <Button type="primary" key="new" onClick={() => {
                  setCurrentStep(0);
                  setUploadedFile(null);
                }}>
                  发起新批次
                </Button>,
              ]}
            />
          )}

          {isFailed && (
            <Result
              status="error"
              title="批量发布异常"
              subTitle={`已完成 ${jobStatus.successCount} 条，失败 ${jobStatus.failedCount} 条`}
              extra={[
                <Button key="retry" onClick={() => setCurrentStep(0)}>重新开始</Button>,
              ]}
            />
          )}

          {/* Results Table */}
          {jobStatus?.results && jobStatus.results.length > 0 && (
            <Table
              columns={resultColumns}
              dataSource={jobStatus.results}
              rowKey="row"
              size="small"
              pagination={{ pageSize: 20 }}
              style={{ marginTop: 24 }}
            />
          )}
        </Card>
      )}
    </div>
  );
};
