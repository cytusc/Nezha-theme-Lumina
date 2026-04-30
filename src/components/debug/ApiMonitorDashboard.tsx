import { useState, useEffect } from "react";
import { apiMonitor, apiLogger } from "@/services/api";
import type { ApiMetrics, LogEntry } from "@/services/api/types";

export function ApiMonitorDashboard() {
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    function updateMetrics() {
      setMetrics(apiMonitor.getMetrics());
      if (showLogs) {
        setLogs(apiLogger.getLogs({ since: Date.now() - 5 * 60_000 }));
      }
    }

    updateMetrics();

    let interval: number | undefined;
    if (autoRefresh) {
      interval = window.setInterval(updateMetrics, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showLogs, autoRefresh]);

  if (!metrics) return null;

  const successRate = metrics.totalRequests > 0
    ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)
    : "100.0";

  const avgTime = Math.round(metrics.averageResponseTime);

  return (
    <div className="api-monitor-dashboard">
      <div className="monitor-header">
        <h3>🔌 API 接口监控面板</h3>
        <div className="monitor-controls">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`control-btn ${autoRefresh ? "active" : ""}`}
          >
            {autoRefresh ? "⏸️ 暂停刷新" : "▶️ 自动刷新"}
          </button>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`control-btn ${showLogs ? "active" : ""}`}
          >
            {showLogs ? "📋 隐藏日志" : "📋 显示日志"}
          </button>
          <button onClick={() => apiMonitor.reset()} className="control-btn warning">
            🗑️ 重置数据
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card total">
          <div className="metric-value">{metrics.totalRequests}</div>
          <div className="metric-label">总请求数</div>
        </div>

        <div className="metric-card success">
          <div className="metric-value">{metrics.successfulRequests}</div>
          <div className="metric-label">成功请求</div>
        </div>

        <div className="metric-card error">
          <div className="metric-value">{metrics.failedRequests}</div>
          <div className="metric-label">失败请求</div>
        </div>

        <div className="metric-card rate">
          <div className="metric-value">{successRate}%</div>
          <div className="metric-label">成功率</div>
        </div>

        <div className="metric-card time">
          <div className="metric-value">{avgTime}ms</div>
          <div className="metric-label">平均响应时间</div>
        </div>

        <div className="metric-card rpm">
          <div className="metric-value">{apiMonitor.getRequestsPerMinute()}</div>
          <div className="metric-label">请求/分钟</div>
        </div>
      </div>

      {Object.keys(metrics.requestsByEndpoint).length > 0 && (
        <div className="endpoints-section">
          <h4>📍 接口详情</h4>
          <div className="endpoints-table-wrapper">
            <table className="endpoints-table">
              <thead>
                <tr>
                  <th>接口路径</th>
                  <th>调用次数</th>
                  <th>成功</th>
                  <th>失败</th>
                  <th>平均耗时</th>
                  <th>最短/最长</th>
                  <th>最后状态</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.requestsByEndpoint)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([endpoint, data]) => (
                    <tr key={endpoint}>
                      <td className="endpoint-path">{endpoint}</td>
                      <td>{data.count}</td>
                      <td className="success-cell">{data.successCount}</td>
                      <td className={data.failCount > 0 ? "error-cell" : ""}>{data.failCount}</td>
                      <td>{Math.round(data.avgDuration)}ms</td>
                      <td>{Math.round(data.minDuration)}ms / {Math.round(data.maxDuration)}ms</td>
                      <td>
                        <span className={`status-badge ${data.lastStatus >= 200 && data.lastStatus < 300 ? "success" : data.lastStatus >= 400 ? "error" : "warning"}`}>
                          {data.lastStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="logs-section">
          <h4>📝 最近日志 (最近5分钟)</h4>
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="no-logs">暂无日志记录</div>
            ) : (
              logs.slice(-50).reverse().map((log, index) => (
                <div key={index} className={`log-entry ${log.level}`}>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="log-level">{log.level.toUpperCase()}</span>
                  <span className="log-message">{log.message}</span>
                  {log.context && (
                    <pre className="log-context">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiMonitorDashboard;
