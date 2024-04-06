// src/components/CanvasComponent.tsx

import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useRef, useEffect, useState } from 'react';
import { Button, Col, Container, Modal, Row, Table } from 'react-bootstrap';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, CardList, CaretRight, BoxArrowInDownLeft, BoxArrowInDownRight } from 'react-bootstrap-icons';
import { IPlay, KeyboardStick, ButtonType, saveData } from '../services/PlayData';
import { TitlePlay } from '../services/TitlePlay';

interface CanvasComponentProps {
  // ここに必要なプロパティを追加
}


const keyConfigIndex = [
  ButtonType.Up,
  ButtonType.Left,
  ButtonType.Down,
  ButtonType.Right,
  ButtonType.Select,
  ButtonType.Pause,
  ButtonType.LeftBeam,
  ButtonType.RightBeam
];

const stick = new KeyboardStick();
let playing = true;
let context: WebGL2RenderingContext;
let playData: IPlay;
const keyConfigLabels = [
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'ShiftLeft',
  'Enter',
  'KeyZ',
  'KeyX'
];
let configSetMap: { [key: string]: number; } = {};

const CanvasComponent: React.FC<CanvasComponentProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationFrameId, setAnimationFrameId] = useState<number>();
  const [isOpen, setIsOpen] = useState(false);
  const [keyConfig, setKeyConfig] = useState<string[]>(keyConfigLabels);
  const [keySelect, setKeySelect] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [keyLabels, setKeyLabels] = useState<string[]>([]);

  const makeKeyLabels = () => {
    const config = stick.getKeyConfig();
    for (let key in config) {
      const type = config[key];
      keyConfigLabels[keyConfigIndex.indexOf(type)] = key;
    }
  };

  const openDialog = () => {
    makeKeyLabels();
    setIsOpen(true);
    setKeySelect(0);
    configSetMap = {};
    if (buttonRef.current) {
      buttonRef.current.blur();
    }
  };
  const closeDialog = () => {
    setIsOpen(false);
  };
  const applyDialog = () => {
    let config: { [key: string]: ButtonType; } = {};
    for (let key in configSetMap) {
      config[key] = keyConfigIndex[configSetMap[key]];
    }
    stick.setKeyConfig(config);
    setKeyLabels([...keyConfigLabels]);
    setIsOpen(false);
  };

  const isOpenRef = useRef(isOpen);
  const keySelectRef = useRef(keySelect);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    keySelectRef.current = keySelect;
  }, [keySelect]);
  const onKeyEvent = (event: KeyboardEvent) => {
    if (isOpenRef.current) {
      if (event.type === 'keydown') {
        if (keySelectRef.current < 0 || event.code in configSetMap) {
          // すでに設定済み
          return;
        }
        event.preventDefault();
        configSetMap[event.code] = keySelectRef.current;
        keyConfigLabels[keySelectRef.current] = event.code;
        if (keySelectRef.current + 1 < keyConfigLabels.length) {
          setKeySelect(keySelectRef.current + 1);
        } else {
          setKeySelect(-1);
        }
      }
    } else {
      if (stick.processEvent(event as any)) {
        event.preventDefault();
      }
    }
  };

  let ignore = false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ignore) return;
    saveData.getConfig('keyConfig').then(res => {
      makeKeyLabels();
      setKeyLabels([...keyConfigLabels]);
    });

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
        <Table striped bordered style={{ marginLeft: '1em' }}>
          <thead>
            <tr><th colSpan={2}>キー</th><th>操作内容</th></tr>
          </thead>
          <tbody>
            <tr><td><ArrowUp></ArrowUp></td><td>{keyLabels[0]}</td><td rowSpan={4}>プレイヤー移動<br />ステージ選択</td></tr>
            <tr><td><ArrowLeft></ArrowLeft></td><td>{keyLabels[1]}</td></tr>
            <tr><td><ArrowDown></ArrowDown></td><td>{keyLabels[2]}</td></tr>
            <tr><td><ArrowRight></ArrowRight></td><td>{keyLabels[3]}</td></tr>
            <tr><td><CardList></CardList></td><td>{keyLabels[4]}</td><td>ゲーム種別選択</td></tr>
            <tr><td><CaretRight></CaretRight></td><td>{keyLabels[5]}</td><td>ゲーム開始・中断・再開</td></tr>
            <tr><td><BoxArrowInDownLeft></BoxArrowInDownLeft></td><td>{keyLabels[6]}</td><td>左に穴を掘る</td></tr>
            <tr><td><BoxArrowInDownRight></BoxArrowInDownRight></td><td>{keyLabels[7]}</td><td>右に穴を掘る</td></tr>
          </tbody>
        </Table>
        <Button onClick={openDialog} ref={buttonRef}>キー設定</Button>
        <Modal show={isOpen} onHide={closeDialog}>
          <Modal.Header>
            <Modal.Title>キー設定</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Container>
              <Row>
                <Col xs={2}></Col>
                <Col xs={3} className='text-center'>
                  <ArrowUp size={50} className={keySelect === 0 ? 'bg-info' : ''}></ArrowUp>
                  <p style={{ fontSize: '10px' }}>{keyConfig[0]}</p>
                </Col>
                <Col xs={1}></Col>
                <Col xs={3} className='text-center'>
                  <CardList size={30} className={keySelect === 4 ? 'bg-info' : ''}></CardList>
                  <p style={{ fontSize: '10px' }}>{keyConfig[4]}</p>
                </Col>
                <Col xs={3} className='text-center'>
                  <CaretRight size={30} className={keySelect === 5 ? 'bg-info' : ''}></CaretRight>
                  <p style={{ fontSize: '10px' }}>{keyConfig[5]}</p>
                </Col>
              </Row>
              <Row>
                <Col xs={3} className='text-center'>
                  <ArrowLeft size={50} className={keySelect === 1 ? 'bg-info' : ''}></ArrowLeft>
                  <p style={{ fontSize: '10px' }}>{keyConfig[1]}</p>
                </Col>
                <Col xs={1}></Col>
                <Col xs={3} sm={3} md={3} lg={3} className='text-center'>
                  <ArrowRight size={50} className={keySelect === 3 ? 'bg-info' : ''}></ArrowRight>
                  <p style={{ fontSize: '10px' }}>{keyConfig[3]}</p>
                </Col>
              </Row>
              <Row>
                <Col xs={2}></Col>
                <Col xs={3} className='text-center'>
                  <ArrowDown size={50} className={keySelect === 2 ? 'bg-info' : ''}></ArrowDown>
                  <p style={{ fontSize: '10px' }}>{keyConfig[2]}</p>
                </Col>
                <Col xs={1}></Col>
                <Col xs={3} className='text-center'>
                  <BoxArrowInDownLeft size={50} className={keySelect === 6 ? 'bg-info' : ''}></BoxArrowInDownLeft>
                  <p style={{ fontSize: '10px' }}>{keyConfig[6]}</p>
                </Col>
                <Col xs={3} className='text-center'>
                  <BoxArrowInDownRight size={50} className={keySelect === 7 ? 'bg-info' : ''}></BoxArrowInDownRight>
                  <p style={{ fontSize: '10px' }}>{keyConfig[7]}</p>
                </Col>
              </Row>
            </Container>
          </Modal.Body>
          <Modal.Footer>
            <Button disabled={keySelect >= 0} variant='success' onClick={applyDialog}>決定</Button>
            <Button disabled={keySelect === 0} variant='warning' onClick={openDialog}>再設定</Button>
            <Button variant='danger' onClick={closeDialog}>キャンセル</Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div >
  );
};

export default CanvasComponent;
