"use client";

import { useEffect, useMemo, useState } from 'react';
import { getActions, Action } from '@/lib/store/idb';
import { useTrackMountEvent } from '@/lib/instrumentation';

export function ArchiveSearch({ onClose }: { onClose: () => void }) {
  useTrackMountEvent('archive_searched');
  const [query, setQuery] = useState('');
  const [allArchived, setAllArchived] = useState<Action[]>([]);

  useEffect(() => {
    getActions().then(actions => {
      setAllArchived(actions.filter(a => a.state === 'ARCHIVED'));
    });
  }, []);

  const results = useMemo(() => {
    if (query.trim().length === 0) return [];
    const lower = query.toLowerCase();
    return allArchived.filter(a =>
      a.title.toLowerCase().includes(lower) ||
      a.rationale.toLowerCase().includes(lower)
    );
  }, [query, allArchived]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-primary)', zIndex: 100, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>ค้นหาในคลังเก็บ</h2>
        <button onClick={onClose} style={{ padding: '0.5rem 1rem' }}>ปิด</button>
      </div>

      <input 
        id="archive-search-query"
        name="archiveSearchQuery"
        type="text" 
        placeholder="พิมพ์เพื่อค้นหาก้าวก่อนหน้า..." 
        value={query} 
        onChange={e => setQuery(e.target.value)} 
        autoFocus
      />

      {query.trim().length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>ที่นี่ไม่มีรายการให้ไล่ดู คุณต้องค้นหาสิ่งที่อยากตามกลับมาโดยตรง</p>
      ) : (
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.length === 0 ? (
            <p>ยังไม่พบผลลัพธ์</p>
          ) : (
            results.map(r => (
              <div key={r.id} style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                <strong>{r.title}</strong>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{r.rationale}</p>
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#888' }}>
                  {new Date(r.createdAt).toLocaleDateString('th-TH')}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
