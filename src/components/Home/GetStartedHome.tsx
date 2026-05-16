"use client";

import type { ReactNode } from 'react';

interface GetStartedHomeProps {
  children: ReactNode;
  showIntro?: boolean;
}

export function GetStartedHome({ children, showIntro = false }: GetStartedHomeProps) {
  return (
    <div className="get-started-home">
      <div className="get-started-home-primary">
        {children}
      </div>
      {showIntro && (
        <div className="get-started-home-context" aria-label="MIND ช่วยเริ่มงานจากบริบทอย่างไร">
          <p className="get-started-home-context-copy">
            วางอีเมล note แชต ตารางงาน หรือเล่าว่างานนี้ค้างอยู่ตรงไหน แล้วค่อยให้ MIND ถามเพิ่มถ้าจำเป็น
          </p>
          <div className="get-started-home-context-strip">
            <span>paste ก่อน</span>
            <span>ถามเพิ่ม 1 คำถาม</span>
            <span>ได้ก้าวแรกที่เริ่มได้จริง</span>
          </div>
        </div>
      )}
    </div>
  );
}
