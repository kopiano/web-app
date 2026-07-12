import { useState, useEffect } from 'react';
import '@/styles/backgroundImg.scss';

export default function BackgroundImg() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % 6);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="background-wrapper">
        {/* 每8s更换一次背景图片 */}
        <div className="wrapper-images">
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`wrapper-img bg-${i}${i === active ? ' active' : ''}`} />
            ))}
        </div>
        <div className="wrapper-blur"></div>
        <div className="wrapper-color"></div>
    </div>
  );
}