'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Layers, Building2, Boxes } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { buildLevelTree } from '../di-types';

export function LevelTreeView() {
  const { state } = useWorkspace();
  const levels = useMemo(() => buildLevelTree(state.summaryViews), [state.summaryViews]);

  const [openLevels, setOpenLevels] = useState<Set<string>>(() => new Set(levels[0] ? [levels[0].levelId] : []));
  const [openDisciplines, setOpenDisciplines] = useState<Set<string>>(new Set());

  const toggleLevel = (levelId: string) => {
    setOpenLevels((current) => {
      const next = new Set(current);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  };

  const toggleDiscipline = (key: string) => {
    setOpenDisciplines((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (levels.length === 0) {
    return (
      <div className="di-panel" style={{ borderRadius: 10, padding: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <Layers size={22} style={{ color: 'var(--di-text3)' }} />
        <div style={{ fontSize: 12, fontWeight: 500 }}>Belum ada level tercatat</div>
        <div style={{ fontSize: 11, color: 'var(--di-text2)', lineHeight: 1.5 }}>
          Snapshot Project Graph untuk proyek ini belum tersedia atau belum ada level yang tersintesis.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--di-text3)', padding: '0 4px 6px', lineHeight: 1.4 }}>
        Jumlah = kelompok tercatat di gambar — bukan jumlah fisik terpasang.
      </div>
      {levels.map((level) => {
        const levelOpen = openLevels.has(level.levelId);
        return (
          <div key={level.levelId}>
            <button
              className="di-btn di-btn-ghost"
              onClick={() => toggleLevel(level.levelId)}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                height: 30,
                padding: '0 6px',
                gap: 6,
              }}
            >
              {levelOpen ? <ChevronDown size={13} color="var(--di-text3)" /> : <ChevronRight size={13} color="var(--di-text3)" />}
              <Building2 size={13} color="var(--di-text2)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {level.levelName}
              </span>
              <span className="di-mono di-pill" style={{ fontSize: 10 }}>{level.totalOccurrences}</span>
            </button>

            {levelOpen && (
              <div style={{ marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginBottom: 4 }}>
                {level.disciplines.map((group) => {
                  const key = `${level.levelId}::${group.discipline}`;
                  const disciplineOpen = openDisciplines.has(key);
                  return (
                    <div key={key}>
                      <button
                        className="di-btn di-btn-ghost"
                        onClick={() => toggleDiscipline(key)}
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          height: 28,
                          padding: '0 6px',
                          gap: 6,
                        }}
                      >
                        {disciplineOpen ? <ChevronDown size={12} color="var(--di-text3)" /> : <ChevronRight size={12} color="var(--di-text3)" />}
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--di-text2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.discipline}
                        </span>
                        <span className="di-mono di-pill" style={{ fontSize: 9.5 }}>{group.occurrenceTotal}</span>
                      </button>

                      {disciplineOpen && (
                        <div style={{ marginLeft: 19, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1, marginBottom: 2 }}>
                          {group.elementTypes.length === 0 ? (
                            <div style={{ fontSize: 10.5, color: 'var(--di-text3)', padding: '4px 6px' }}>Tidak ada tipe elemen.</div>
                          ) : (
                            group.elementTypes.map((elementType) => (
                              <div
                                key={elementType.element_type_id}
                                className="di-btn di-btn-ghost"
                                style={{
                                  width: '100%',
                                  justifyContent: 'flex-start',
                                  height: 26,
                                  padding: '0 6px',
                                  gap: 6,
                                  cursor: 'default',
                                }}
                              >
                                <Boxes size={11} color="var(--di-text3)" />
                                <span style={{ fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {elementType.name}
                                </span>
                                <span className="di-mono di-pill" style={{ fontSize: 9.5 }}>{elementType.occurrence_count}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
