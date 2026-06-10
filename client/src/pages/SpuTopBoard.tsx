import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  Typography,
  DatePicker,
  Space,
  Alert,
  Tabs,
  Select,
  Image,
  Button,
  Tag,
  App,
  Empty,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { HolderOutlined, ReloadOutlined, TrophyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';
import { SpuTopColumnSettings } from '../components/SpuTopBoard/SpuTopColumnSettings';
import { useAuthStore } from '../store/authStore';
import { useSpuTopColumnOrderStore } from '../store/spuTopColumnOrderStore';
import { todayDateString } from '../utils/todayRange';
import { applySpuTopColumnOrder } from '../utils/spuTopColumnOrder';

const { Title, Text } = Typography;
const REFRESH_MS = 15 * 60 * 1000;

interface SpuTopItem {
  id: string;
  rank: number;
  spu: string;
  productId: string;
  title: string;
  imageUrl: string;
  productCreatedAt: string | null;
  orderCount: number;
  addCartUsers: number;
  viewUsers: number;
  addToCartRate: number;
  transformRate: number;
  compositeScore: number;
}

interface ShopSpuTop {
  shopId: string;
  shopDomain: string;
  shopName: string;
  items: SpuTopItem[];
  syncedAt: string | null;
  manualOrder?: boolean;
}

interface CollectionOption {
  id: string;
  title: string;
}

function formatRate(v: number): string {
  return `${(Number(v) * 100).toFixed(2)}%`;
}

function formatCreatedAt(value: string | null): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function reindexItems(items: SpuTopItem[]): SpuTopItem[] {
  return items.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

export const SpuTopBoard: React.FC = () => {
  const { message } = App.useApp();
  const userRole = useAuthStore((s) => s.userRole);
  const isAdmin = userRole === 'admin';
  const columnOrder = useSpuTopColumnOrderStore((s) => s.order);
  const fetchColumnOrder = useSpuTopColumnOrderStore((s) => s.fetchOrder);

  const [statDate, setStatDate] = useState(todayDateString());
  const [shopList, setShopList] = useState<ShopSpuTop[]>([]);
  const [latestSyncedAt, setLatestSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeShopId, setActiveShopId] = useState<string>('');
  const [collectionByShop, setCollectionByShop] = useState<Record<string, string>>({});
  const [collectionsByShop, setCollectionsByShop] = useState<Record<string, CollectionOption[]>>({});
  const [collectionsLoading, setCollectionsLoading] = useState<Record<string, boolean>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const activeShop = useMemo(
    () => shopList.find((s) => s.shopId === activeShopId) || null,
    [shopList, activeShopId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/analytics/spu-top', {
        params: { date: statDate },
        timeout: 60_000,
      });
      let shops: ShopSpuTop[] = resp.data.shops || [];
      setLatestSyncedAt(resp.data.latestSyncedAt || null);

      const collId = activeShopId ? collectionByShop[activeShopId] || '' : '';
      if (activeShopId && collId) {
        const filtered = await api.get('/analytics/spu-top', {
          params: { date: statDate, shopId: activeShopId, collectionId: collId },
          timeout: 60_000,
        });
        const filteredShop = filtered.data.shops?.[0];
        if (filteredShop) {
          shops = shops.map((s) => (s.shopId === activeShopId ? filteredShop : s));
        }
      }

      setShopList(shops);
      if (shops.length > 0) {
        setActiveShopId((prev) =>
          prev && shops.some((s) => s.shopId === prev) ? prev : shops[0].shopId
        );
      } else {
        setActiveShopId('');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || '加载失败';
      setError(String(msg));
      setShopList([]);
    } finally {
      setLoading(false);
    }
  }, [statDate, activeShopId, collectionByShop]);

  const loadCollections = useCallback(async (shopId: string) => {
    if (!shopId || collectionsByShop[shopId]) return;
    setCollectionsLoading((prev) => ({ ...prev, [shopId]: true }));
    try {
      const resp = await api.get('/analytics/spu-top/collections', { params: { shopId } });
      setCollectionsByShop((prev) => ({
        ...prev,
        [shopId]: resp.data.collections || [],
      }));
    } catch {
      setCollectionsByShop((prev) => ({ ...prev, [shopId]: [] }));
    } finally {
      setCollectionsLoading((prev) => ({ ...prev, [shopId]: false }));
    }
  }, [collectionsByShop]);

  useEffect(() => {
    fetchColumnOrder();
  }, [fetchColumnOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadData();
      fetchColumnOrder();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadData, fetchColumnOrder]);

  useEffect(() => {
    if (activeShopId) loadCollections(activeShopId);
  }, [activeShopId, loadCollections]);

  const handleManualRefresh = async () => {
    if (!isAdmin) return;
    setRefreshing(true);
    try {
      await api.post('/analytics/spu-top/refresh', { date: statDate }, { timeout: 180_000 });
      await loadData();
      message.success('同步完成');
    } catch (err: any) {
      message.error(err.response?.data?.error || '同步失败');
    } finally {
      setRefreshing(false);
    }
  };

  const saveReorder = async (items: SpuTopItem[]) => {
    if (!activeShop) return;
    setSavingOrder(true);
    try {
      await api.put('/analytics/spu-top/reorder', {
        shopId: activeShop.shopId,
        date: statDate,
        collectionId: collectionByShop[activeShopId] || '',
        orderedIds: items.map((i) => i.id),
      });
      setShopList((prev) =>
        prev.map((s) =>
          s.shopId === activeShop.shopId ? { ...s, items, manualOrder: true } : s
        )
      );
      message.success('排序已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存排序失败');
      await loadData();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDrop = async (targetIndex: number) => {
    if (!isAdmin || !activeShop || dragIndex === null) return;
    const next = reindexItems(moveItem(activeShop.items, dragIndex, targetIndex));
    setDragIndex(null);
    setShopList((prev) =>
      prev.map((s) => (s.shopId === activeShop.shopId ? { ...s, items: next } : s))
    );
    await saveReorder(next);
  };

  const columns: ColumnsType<SpuTopItem> = useMemo(() => {
    const dataColumns: ColumnsType<SpuTopItem> = [
      {
        title: '排名',
        dataIndex: 'rank',
        key: 'rank',
        width: 64,
        render: (v) => <Tag color={v <= 3 ? 'gold' : 'default'}>{v}</Tag>,
      },
      {
        title: '商品',
        key: 'product',
        width: 280,
        render: (_, r) => (
          <Space>
            <Image
              src={r.imageUrl}
              width={48}
              height={48}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23f0f0f0' width='48' height='48'/%3E%3C/svg%3E"
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
                }}
              >
                {r.title || r.spu}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.spu}
              </Text>
            </div>
          </Space>
        ),
      },
      {
        title: '综合分',
        dataIndex: 'compositeScore',
        key: 'compositeScore',
        width: 88,
        render: (v) => Number(v).toFixed(2),
      },
      { title: '订单量', dataIndex: 'orderCount', key: 'orderCount', width: 80 },
      {
        title: '创建时间',
        dataIndex: 'productCreatedAt',
        key: 'productCreatedAt',
        width: 130,
        render: (v) => (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatCreatedAt(v)}
          </Text>
        ),
      },
      { title: '加购用户数', dataIndex: 'addCartUsers', key: 'addCartUsers', width: 100 },
      { title: '浏览用户数', dataIndex: 'viewUsers', key: 'viewUsers', width: 100 },
      {
        title: '加购率',
        dataIndex: 'addToCartRate',
        key: 'addToCartRate',
        width: 90,
        render: (v) => formatRate(v),
      },
      {
        title: '转化率',
        dataIndex: 'transformRate',
        key: 'transformRate',
        width: 90,
        render: (v) => formatRate(v),
      },
    ];

    const ordered = applySpuTopColumnOrder(dataColumns, columnOrder);

    if (!isAdmin) return ordered;

    return [
      {
        title: '',
        key: 'drag',
        width: 40,
        render: () => <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />,
      },
      ...ordered,
    ];
  }, [isAdmin, columnOrder]);

  const tabItems = shopList.map((shop) => ({
    key: shop.shopId,
    label: shop.shopName || shop.shopDomain,
  }));

  const collectionId = collectionByShop[activeShopId] || '';
  const isToday = statDate === todayDateString();

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Space>
          <TrophyOutlined style={{ fontSize: 20, color: '#faad14' }} />
          <Title level={4} style={{ margin: 0 }}>
            各店铺 SPU TOP 榜
          </Title>
        </Space>
        <Space wrap>
          <DatePicker
            value={dayjs(statDate)}
            onChange={(d) => d && setStatDate(d.format('YYYY-MM-DD'))}
            allowClear={false}
          />
          {!isToday && (
            <Button onClick={() => setStatDate(todayDateString())}>回到今天</Button>
          )}
          {isAdmin && (
            <>
              <SpuTopColumnSettings />
              <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleManualRefresh}>
                立即同步
              </Button>
            </>
          )}
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <Space split="|" wrap>
            <span>统计日期: {statDate}</span>
            <span>每 15 分钟自动刷新</span>
            {latestSyncedAt && (
              <span>最后同步: {new Date(latestSyncedAt).toLocaleString()}</span>
            )}
            <span>默认按综合分排序（销量/浏览/转化率/加购率/新品加成）</span>
            {isAdmin && <span>管理员可拖拽微调排序；列设置保存后全员生效</span>}
          </Space>
        }
      />

      {error && (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} closable />
      )}

      <Spin spinning={loading}>
        {shopList.length === 0 && !loading ? (
          <Empty
            description={
              isToday
                ? '暂无榜单数据，请稍后刷新或联系管理员同步'
                : '该日期暂无数据，请切换到今天查看'
            }
          />
        ) : (
          <>
            <Tabs
              activeKey={activeShopId}
              items={tabItems}
              onChange={(key) => setActiveShopId(key)}
            />

            {activeShop && (
              <div style={{ marginTop: 16 }}>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Select
                    style={{ minWidth: 240 }}
                    allowClear
                    showSearch
                    placeholder="全部商品"
                    loading={collectionsLoading[activeShopId]}
                    value={collectionId || undefined}
                    options={(collectionsByShop[activeShopId] || []).map((c) => ({
                      value: c.id,
                      label: c.title,
                    }))}
                    onChange={(v) =>
                      setCollectionByShop((prev) => ({
                        ...prev,
                        [activeShopId]: v || '',
                      }))
                    }
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                  {activeShop.manualOrder && (
                    <Tag color="blue">已手动排序（综合分仅供参考）</Tag>
                  )}
                  {activeShop.syncedAt && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      本店同步: {new Date(activeShop.syncedAt).toLocaleString()}
                      {collectionId ? ` · 专辑: ${collectionId}` : ' · 全部商品'}
                    </Text>
                  )}
                </Space>
                <Table
                  rowKey={(r) => r.id}
                  columns={columns}
                  dataSource={[...activeShop.items].sort((a, b) => a.rank - b.rank)}
                  loading={savingOrder}
                  pagination={false}
                  size="small"
                  scroll={{ x: 900 }}
                  locale={{ emptyText: '暂无商品数据' }}
                  onRow={(_, index) => {
                    if (!isAdmin) return {};
                    return {
                      draggable: true,
                      style: { cursor: 'grab' },
                      onDragStart: () => setDragIndex(index ?? null),
                      onDragOver: (e) => e.preventDefault(),
                      onDrop: () => handleDrop(index ?? 0),
                    };
                  }}
                />
              </div>
            )}
          </>
        )}
      </Spin>
    </div>
  );
};
