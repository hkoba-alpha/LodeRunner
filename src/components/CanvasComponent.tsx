// src/components/CanvasComponent.tsx

import React, { useRef, useEffect, useState, ChangeEvent } from 'react';
import { } from '../services/MyService';
import { IPlay, KeyboardStick } from '../services/PlayData';
import { TitlePlay } from '../services/TitlePlay';
import { displayPartsToString } from 'typescript';

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
    <div style={{ display: "flex", padding: "1em" }}>
      <canvas ref={canvasRef} width={512} height={480} style={{ backgroundColor: "black" }} />
      <div>
        <table border={1} style={{ marginLeft: "1em" }}>
          <thead>
            <tr><th>キー</th><th>操作内容</th></tr>
          </thead>
          <tbody>
            <tr><td>Enter</td><td>ゲーム開始・中断・再開</td></tr>
            <tr><td>左Shift</td><td>ゲーム種別選択</td></tr>
            <tr><td>カーソルキー</td><td>プレイヤー移動・ステージ選択</td></tr>
            <tr><td>Z</td><td>左に穴を掘る</td></tr>
            <tr><td>X</td><td>右に穴を掘る</td></tr>
          </tbody>
        </table>
      </div>
    </div >
  );
};

export default CanvasComponent;
