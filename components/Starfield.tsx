"use client";

import { useEffect, useState } from "react";

type Star = {
  id: number;
  top: string;
  left: string;
  size: number;
  color: string;
  opacity: number;
  delay: string;
};

function makeStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const isYellow = Math.random() < 0.35;
    stars.push({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1,
      color: isYellow ? "#FACC15" : "#F5F5F5",
      opacity: Math.random() * 0.6 + 0.2,
      delay: `${(Math.random() * 4).toFixed(2)}s`,
    });
  }
  return stars;
}

export default function Starfield() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    setStars(makeStars(140));
  }, []);

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className="star animate-drift"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            background: s.color,
            opacity: s.opacity,
            animationDelay: s.delay,
            boxShadow:
              s.color === "#FACC15"
                ? `0 0 ${s.size * 3}px rgba(250,204,21,0.6)`
                : `0 0 ${s.size * 2}px rgba(255,255,255,0.35)`,
          }}
        />
      ))}
    </div>
  );
}
