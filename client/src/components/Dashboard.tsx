import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricsResult } from '../../../shared/types';
import { fmtInt } from '../format';
import { AuthorsTable, CommitsTable, DirsTable, FilesTable, SummaryCards } from './Tables';

const GRID = '#262d3b';
const AXIS = '#8a94a8';

function inferTickFormat(timeline: MetricsResult['timeline']): (t: number) => string {
  if (timeline.length < 2) return (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const spanDays = (timeline[timeline.length - 1].t - timeline[0].t) / 86400;
  if (spanDays > 730) {
    return (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Dashboard({
  metrics,
  activeAuthors,
  activePath,
  onAuthorToggle,
  onPathSelect,
}: {
  metrics: MetricsResult;
  activeAuthors: string[];
  activePath: string;
  onAuthorToggle: (key: string) => void;
  onPathSelect: (path: string, mode: 'file' | 'dir') => void;
}) {
  const [tab, setTab] = useState<'authors' | 'files' | 'dirs' | 'commits'>('authors');
  const tickFmt = useMemo(() => inferTickFormat(metrics.timeline), [metrics.timeline]);
  const topAuthors = metrics.authors.slice(0, 8).map((a) => ({ name: a.name, commits: a.commits }));

  return (
    <>
      <SummaryCards metrics={metrics} />

      <div className="charts-row">
        <div className="chart-card">
          <h3>Activity over time</h3>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={metrics.timeline} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tickFormatter={tickFmt} stroke={AXIS} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis yAxisId="lines" stroke={AXIS} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="commits" orientation="right" stroke={AXIS} tick={{ fontSize: 11 }} width={36} />
              <Tooltip
                contentStyle={{ background: '#1d2330', border: '1px solid #2a3140', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                formatter={(value, name) => [fmtInt(Number(value)), String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="lines" dataKey="added" name="Added" fill="#3fb27f" fillOpacity={0.75} />
              <Bar yAxisId="lines" dataKey="removed" name="Removed" fill="#e06c75" fillOpacity={0.75} />
              <Line yAxisId="commits" dataKey="commits" name="Commits" stroke="#61afef" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Top authors (commits)</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={topAuthors} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke={AXIS} tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke={AXIS} tick={{ fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={{ background: '#1d2330', border: '1px solid #2a3140', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [fmtInt(Number(value)), 'Commits']}
              />
              <Bar dataKey="commits" fill="#61afef" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'authors' ? 'active' : ''} onClick={() => setTab('authors')}>
          Authors
        </button>
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          Files ({metrics.files.length})
        </button>
        <button className={tab === 'dirs' ? 'active' : ''} onClick={() => setTab('dirs')}>
          Directories ({metrics.dirs.length})
        </button>
        <button className={tab === 'commits' ? 'active' : ''} onClick={() => setTab('commits')}>
          Commits
        </button>
      </div>

      {tab === 'authors' && <AuthorsTable rows={metrics.authors} activeAuthors={activeAuthors} onToggle={onAuthorToggle} />}
      {tab === 'files' && (
        <FilesTable
          rows={metrics.files}
          activePath={activePath}
          onSelect={(p) => onPathSelect(p, 'file')}
        />
      )}
      {tab === 'dirs' && (
        <DirsTable
          rows={metrics.dirs}
          activePath={activePath}
          onSelect={(p) => onPathSelect(p, 'dir')}
        />
      )}
      {tab === 'commits' && <CommitsTable rows={metrics.commits} total={metrics.commitsTotal} />}
    </>
  );
}
