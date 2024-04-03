// src/components/CanvasComponent.tsx

import React, { useRef, useEffect, useState, ChangeEvent } from 'react';
import { } from '../services/MyService';
import { IPlay, KeyboardStick } from '../services/PlayData';
import { TitlePlay } from '../services/TitlePlay';

interface CanvasComponentProps {
  // ここに必要なプロパティを追加
}

const stick = new KeyboardStick();
let playing = true;
let context: WebGL2RenderingContext;
let playData: IPlay;

const CanvasComponent: React.FC<CanvasComponentProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState(1);
  const [animationFrameId, setAnimationFrameId] = useState<number>();

  const onKeyEvent = (event: KeyboardEvent) => {
    stick.processEvent(event);
  };

  let ignore = false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ignore) return;

    console.log("useEffect");
    //const context = canvas.getContext('2d')!;
    context = canvas.getContext('webgl2')!;

    if (!playData) {
      playData = new TitlePlay(context);
    }
    const proc = () => {
      playData = playData.stepFrame(context, stick);
      if (playing) {
        setAnimationFrameId(requestAnimationFrame(proc));
      }
    };
    setAnimationFrameId(requestAnimationFrame(proc));
    //renderer.setStage(data);
    window.addEventListener("keydown", onKeyEvent, false);
    window.addEventListener("keyup", onKeyEvent, false);
    return () => {
      if (ignore) {
        cancelAnimationFrame(animationFrameId!);
        window.removeEventListener("keydown", onKeyEvent);
        window.removeEventListener("keyup", onKeyEvent);
      }
      ignore = true;
    }
  }, []);

  return (
    <div>
      <div>
        <canvas ref={canvasRef} width={512} height={480} style={{ backgroundColor: "black" }} />
      </div>
    </div>
  );
};

export default CanvasComponent;
