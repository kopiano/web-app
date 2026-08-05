import { useState, useEffect, useRef } from 'react';
import '@/styles/backgroundImg.scss';
import bg1 from '@/assets/images/bg-1.webp';
import bg2 from '@/assets/images/bg-2.webp';
import bg3 from '@/assets/images/bg-3.webp';
import bg4 from '@/assets/images/bg-4.webp';
import bg5 from '@/assets/images/bg-5.webp';

// Reuse the HTML fallback URL for the first frame so React hydration does
// not download the same large image a second time under a hashed URL.
const BACKGROUNDS = ['/bg-0.webp', bg1, bg2, bg3, bg4, bg5];
const BACKGROUND_INTERVAL_MS = 8_000;

export default function BackgroundImg() {
  const [active, setActive] = useState(0);
  const startTimeRef = useRef(Date.now());
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      startTimeRef.current = Date.now();
      if (barRef.current) {
        barRef.current.style.width = '0%';
      }
      setActive(prev => (prev + 1) % 6);
    }, BACKGROUND_INTERVAL_MS);

    let rafId: number;
    function tick() {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / BACKGROUND_INTERVAL_MS) * 100, 100);
      if (barRef.current) {
        barRef.current.style.width = `${pct}%`;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const nextIndex = (active + 1) % BACKGROUNDS.length;
    const image = new Image();
    image.decoding = 'async';
    image.src = BACKGROUNDS[nextIndex];
  }, [active]);

  return (
    <>
      <div className="background-wrapper">
        <div className="wrapper-images">
          <div
            className="wrapper-img active"
            style={{ backgroundImage: `url("${BACKGROUNDS[active]}")` }}
          />
        </div>
        <div className="wrapper-blur"></div>
        <div className="wrapper-color"></div>
      </div>
      <div className="bg-progress">
        <div className="bg-progress-bar" ref={barRef}></div>
      </div>
    </>
  );
}
