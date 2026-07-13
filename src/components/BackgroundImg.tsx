import { useState, useEffect, useRef } from 'react';
import '@/styles/backgroundImg.scss';

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
    }, 8000);

    let rafId: number;
    function tick() {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / 8000) * 100, 100);
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

  return (
    <>
      <div className="background-wrapper">
        <div className="wrapper-images">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`wrapper-img bg-${i}${i === active ? ' active' : ''}`} />
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
