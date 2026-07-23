import { useCallback, useRef, useState } from 'react';
import type { AnalyticsBreakdownResult, AnalyticsExportResult, AnalyticsQueryFilters, AnalyticsQuerySort, AnalyticsRunDrilldownResult, AnalyticsWorkItemsResult, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

type AnalyticsResult = AnalyticsWorkItemsResult | AnalyticsBreakdownResult | AnalyticsRunDrilldownResult | AnalyticsExportResult;
type QueryKind = 'workItems' | 'breakdown' | 'comparison' | 'runDrilldown' | 'export';

/**
 * Analytics requests share the existing WebSocket transport. A request id is
 * tracked per query kind so an out-of-order response can never replace a
 * newer filter selection in a future Analytics UI.
 */
export function useAnalytics(send: (message: WebSocketClientMessage) => void): {
  workItems: AnalyticsWorkItemsResult['payload'] | null;
  breakdown: AnalyticsBreakdownResult['payload'] | null;
  comparison: AnalyticsBreakdownResult['payload'] | null;
  runDrilldown: AnalyticsRunDrilldownResult['payload'] | null;
  exportResult: AnalyticsExportResult['payload'] | null;
  requestWorkItems: (filters: AnalyticsQueryFilters, pagination?: { limit?: number; offset?: number }, sort?: AnalyticsQuerySort) => string;
  requestBreakdown: (filters: AnalyticsQueryFilters, bucket?: 'hour' | 'day' | 'week' | 'month', rankingLimit?: number) => string;
  requestComparisonBreakdown: (filters: AnalyticsQueryFilters, bucket?: 'hour' | 'day' | 'week' | 'month', rankingLimit?: number) => string;
  requestRunDrilldown: (filters: AnalyticsQueryFilters, pagination?: { limit?: number; offset?: number }) => string;
  requestExport: (filters: AnalyticsQueryFilters, format: 'csv' | 'json') => string;
  onAnalyticsMessage: (message: WebSocketServerMessage) => void;
} {
  const [workItems, setWorkItems] = useState<AnalyticsWorkItemsResult['payload'] | null>(null);
  const [breakdown, setBreakdown] = useState<AnalyticsBreakdownResult['payload'] | null>(null);
  const [comparison, setComparison] = useState<AnalyticsBreakdownResult['payload'] | null>(null);
  const [runDrilldown, setRunDrilldown] = useState<AnalyticsRunDrilldownResult['payload'] | null>(null);
  const [exportResult, setExportResult] = useState<AnalyticsExportResult['payload'] | null>(null);
  const sequence = useRef(0);
  const latest = useRef<Partial<Record<QueryKind, string>>>({});

  const requestId = useCallback((kind: QueryKind): string => {
    const id = `analytics-${kind}-${String(Date.now())}-${String(++sequence.current)}`;
    latest.current[kind] = id;
    return id;
  }, []);

  const requestWorkItems = useCallback((filters: AnalyticsQueryFilters, pagination?: { limit?: number; offset?: number }, sort?: AnalyticsQuerySort): string => {
    const id = requestId('workItems');
    send({ type: 'action:getAnalyticsWorkItems', requestId: id, filters, pagination, sort });
    return id;
  }, [requestId, send]);
  const requestBreakdown = useCallback((filters: AnalyticsQueryFilters, bucket?: 'hour' | 'day' | 'week' | 'month', rankingLimit?: number): string => {
    const id = requestId('breakdown');
    send({ type: 'action:getAnalyticsBreakdown', requestId: id, filters, bucket, rankingLimit });
    return id;
  }, [requestId, send]);
  const requestComparisonBreakdown = useCallback((filters: AnalyticsQueryFilters, bucket?: 'hour' | 'day' | 'week' | 'month', rankingLimit?: number): string => {
    const id = requestId('comparison');
    send({ type: 'action:getAnalyticsBreakdown', requestId: id, filters, bucket, rankingLimit });
    return id;
  }, [requestId, send]);
  const requestRunDrilldown = useCallback((filters: AnalyticsQueryFilters, pagination?: { limit?: number; offset?: number }): string => {
    const id = requestId('runDrilldown');
    send({ type: 'action:getAnalyticsRunDrilldown', requestId: id, filters, pagination });
    return id;
  }, [requestId, send]);
  const requestExport = useCallback((filters: AnalyticsQueryFilters, format: 'csv' | 'json'): string => {
    const id = requestId('export');
    send({ type: 'action:exportAnalytics', requestId: id, filters, format });
    return id;
  }, [requestId, send]);

  const onAnalyticsMessage = useCallback((message: WebSocketServerMessage): void => {
    const result: AnalyticsResult | null = message.type === 'analytics:workItems' || message.type === 'analytics:breakdown' || message.type === 'analytics:runDrilldown' || message.type === 'analytics:export' ? message : null;
    if (!result) return;
    const kind: QueryKind = result.type === 'analytics:workItems' ? 'workItems'
      : result.type === 'analytics:runDrilldown' ? 'runDrilldown'
        : result.type === 'analytics:export' ? 'export'
          : latest.current.comparison === result.payload.requestId ? 'comparison' : 'breakdown';
    if (latest.current[kind] !== result.payload.requestId) return;
    if (kind === 'workItems') setWorkItems(result.payload as AnalyticsWorkItemsResult['payload']);
    else if (kind === 'breakdown') setBreakdown(result.payload as AnalyticsBreakdownResult['payload']);
    else if (kind === 'comparison') setComparison(result.payload as AnalyticsBreakdownResult['payload']);
    else if (kind === 'runDrilldown') setRunDrilldown(result.payload as AnalyticsRunDrilldownResult['payload']);
    else setExportResult(result.payload as AnalyticsExportResult['payload']);
  }, []);

  return { workItems, breakdown, comparison, runDrilldown, exportResult, requestWorkItems, requestBreakdown, requestComparisonBreakdown, requestRunDrilldown, requestExport, onAnalyticsMessage };
}
