import { useState, useEffect, useRef } from 'react';
import '@/styles/backgroundImg.scss';
import bg1 from '@/assets/images/bg-1.webp';
import bg2 from '@/assets/images/bg-2.webp';
import bg3 from '@/assets/images/bg-3.webp';
import bg4 from '@/assets/images/bg-4.webp';
import bg5 from '@/assets/images/bg-5.webp';
import bg0 from '@/assets/images/bg-0.webp';

const BACKGROUNDS = [bg0, bg1, bg2, bg3, bg4, bg5];
const BACKGROUND_INTERVAL_MS = 8_000;

export default function BackgroundImg() {
  const [active, setActive] = useState(0);
  const startTimeRef = useRef(Date.now());
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('background-ready');
    // Decode the first frame immediately so the background is ready before
    // the rotating background timer starts.
    const firstImage = new Image();
    firstImage.decoding = 'async';
    firstImage.fetchPriority = 'high';
    firstImage.src = BACKGROUNDS[0];

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
      document.documentElement.classList.remove('background-ready');
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
          {BACKGROUNDS.map((background, index) => (
            <div
              key={background}
              className={`wrapper-img${index === active ? ' active' : ''}`}
              style={{ backgroundImage: `url("${background}")` }}
              aria-hidden="true"
            />
          ))}
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
