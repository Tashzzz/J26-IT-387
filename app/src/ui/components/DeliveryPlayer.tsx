// Video-first replay of one delivery (benchmark: Hudl Technique / OnForm). The skeleton-overlay video is the
// hero, sized to the clip (16:9 or 9:16). Controls: tap-to-play, play/pause, 0.25x / 0.5x / 1x, frame step,
// a scrubber with back-foot / front-foot / release markers (tap a marker to jump to that frame) and a
// skeleton on/off toggle that swaps to the original clip at the same moment. Playback only - no analysis here.
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { alpha, color, font, gradient, HIT, radius, sp } from '../theme';
import { IconButton } from './buttons';
import { SegmentedControl } from './inputs';

/** Frame numbers of the key moments (from the joint-angle step). Missing ones are simply not drawn. */
export type DeliveryEvents = { bfc?: number | null; ffc?: number | null; release?: number | null };

const MARKERS = [
  { key: 'bfc', label: 'Back foot', color: '#A78BFA' },
  { key: 'ffc', label: 'Front foot', color: '#22D3EE' },
  { key: 'release', label: 'Release', color: '#F472B6' },
] as const;

const SPEEDS = [{ value: '0.25', label: '0.25×' }, { value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }] as const;
type Speed = (typeof SPEEDS)[number]['value'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/** Width / height of the clip. Native: from the loaded video track. Web: from the <video> metadata. */
function useAspect(player: VideoPlayer, uri: string) {
  const [aspect, setAspect] = useState<number | null>(null);
  useEventListener(player, 'sourceLoad', (e) => {
    const size = e.availableVideoTracks[0]?.size;
    if (size?.width && size.height) setAspect(size.width / size.height);
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => { if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight); };
    v.src = uri;
    return () => { v.onloadedmetadata = null; v.removeAttribute('src'); };
  }, [uri]);
  return aspect;
}

const setup = (p: VideoPlayer) => {
  p.loop = true;
  p.muted = true;
  p.timeUpdateEventInterval = 1 / 30;
};

export function DeliveryPlayer({ overlayUri, rawUri, fps = 30, events, caption }: {
  /** Video with the skeleton drawn on it. */
  overlayUri: string;
  /** The original clip (same frames). Enables the skeleton on/off toggle. */
  rawUri?: string | null;
  fps?: number;
  events?: DeliveryEvents | null;
  caption?: string;
}) {
  const overlay = useVideoPlayer(overlayUri, setup);
  const raw = useVideoPlayer(rawUri ?? null, setup);
  const [skeleton, setSkeleton] = useState(true);
  const active = skeleton || !rawUri ? overlay : raw;
  const aspect = useAspect(overlay, overlayUri) ?? 16 / 9;

  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('1');
  const dragging = useRef(false);

  useEventListener(active, 'timeUpdate', (e) => {
    if (!dragging.current) setPos(e.currentTime);
    if (active.duration > 0 && active.duration !== dur) setDur(active.duration);
  });
  useEventListener(active, 'playingChange', (e) => setPlaying(e.isPlaying));
  // Autoplay (muted) once the video views are mounted; on web the player needs its <video> element first.
  useEffect(() => { overlay.play(); }, [overlay]);
  useEventListener(active, 'sourceLoad', (e) => { if (e.duration > 0) setDur(e.duration); });

  const rate = fps > 0 ? fps : 30;
  const frame = Math.floor(pos * rate);
  const frameTime = (f: number) => (f + 0.5) / rate; // middle of the frame, so the shown frame is exactly f
  const marks = MARKERS.flatMap((m) => {
    const f = events?.[m.key];
    return f != null && f >= 0 ? [{ ...m, frame: f, t: frameTime(f) }] : [];
  });

  const seek = (t: number) => {
    const v = clamp(t, 0, dur > 0 ? dur - 0.001 : t);
    active.currentTime = v;
    setPos(v);
  };
  const pause = () => { active.pause(); setPlaying(false); };
  const toggle = () => { if (playing) pause(); else { active.play(); setPlaying(true); } };
  const stepFrame = (dir: 1 | -1) => { pause(); seek(frameTime(Math.max(0, frame + dir))); };
  const jump = (f: number) => { pause(); seek(frameTime(f)); };

  function changeSpeed(v: Speed) {
    setSpeed(v);
    overlay.playbackRate = Number(v);
    raw.playbackRate = Number(v);
  }

  function toggleSkeleton() {
    if (!rawUri) return;
    const from = active;
    const to = skeleton ? raw : overlay;
    to.currentTime = from.currentTime;
    to.playbackRate = Number(speed);
    if (playing) { from.pause(); to.play(); }
    setSkeleton(!skeleton);
  }

  // Scrubber: drag anywhere on the track; a tap within 14 px of a marker snaps to that marker's frame.
  const track = useRef<React.ComponentRef<typeof View>>(null);
  const box = useRef({ x: 0, w: 1 });
  const resume = useRef(false);
  const live = useRef({ seek, dur, marks, active });
  live.current = { seek, dur, marks, active };
  const pan = useMemo(() => {
    const at = (pageX: number) => clamp((pageX - box.current.x) / box.current.w, 0, 1);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { active: p, dur: d } = live.current;
        if (d <= 0) return;
        dragging.current = true;
        resume.current = p.playing;
        p.pause();
        const pageX = e.nativeEvent.pageX;
        track.current?.measureInWindow((x, _y, w) => {
          box.current = { x, w: Math.max(1, w) };
          const { marks: m, seek: go, dur: dd } = live.current;
          const near = m.find((k) => Math.abs((k.t / dd) * box.current.w - (pageX - x)) <= 14);
          go(near ? near.t : at(pageX) * dd);
        });
      },
      onPanResponderMove: (_e, g) => { if (dragging.current) live.current.seek(at(g.moveX) * live.current.dur); },
      onPanResponderRelease: () => {
        dragging.current = false;
        if (resume.current) live.current.active.play();
      },
      onPanResponderTerminate: () => { dragging.current = false; },
    });
  }, []);

  // Size the video to the clip: full width, capped at ~60 % of the window height (portrait clips pillarbox).
  const { height: winH } = useWindowDimensions();
  const [w, setW] = useState(0);
  const h = w ? Math.min(w / aspect, Math.max(240, winH * 0.6)) : undefined;
  const progress = dur > 0 ? clamp(pos / dur, 0, 1) : 0;

  return (
    <View style={s.wrap}>
      <View style={[s.video, h ? { height: h } : { aspectRatio: aspect }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        <VideoView player={overlay} nativeControls={false} contentFit="contain"
          style={[s.fillVideo, !(skeleton || !rawUri) && s.hidden]} />
        {rawUri ? (
          <VideoView player={raw} nativeControls={false} contentFit="contain"
            style={[s.fillVideo, (skeleton || !rawUri) && s.hidden]} />
        ) : null}
        <Pressable onPress={toggle} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={playing ? 'Pause video' : 'Play video'}>
          {!playing && (
            <View style={s.bigPlay}><Ionicons name="play" size={34} color={color.text} /></View>
          )}
        </Pressable>
        <Text style={[s.overlayText, s.frameBadge]}>Frame {frame}</Text>
        {rawUri ? (
          <Pressable onPress={toggleSkeleton} accessibilityRole="switch" accessibilityState={{ checked: skeleton }} aria-checked={skeleton} accessibilityLabel="Skeleton overlay"
            style={({ pressed }) => [s.skeletonPill, skeleton && s.skeletonOn, pressed && { opacity: 0.8 }]} hitSlop={8}>
            <Ionicons name={skeleton ? 'body' : 'body-outline'} size={16} color={skeleton ? color.onBrand : color.text} />
            <Text style={[s.overlayText, skeleton && { color: color.onBrand }]}>Skeleton {skeleton ? 'on' : 'off'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.scrubWrap}>
        <View ref={track} style={s.scrubTouch} {...pan.panHandlers} accessible accessibilityRole="adjustable"
          accessibilityLabel="Video position" accessibilityValue={{ min: 0, max: Math.round(dur * 100), now: Math.round(pos * 100), text: clock(pos) }}>
          <View style={s.track}>
            <View style={[s.fill, { width: `${progress * 100}%` }]} />
          </View>
          {dur > 0 && marks.map((m) => (
            <View key={m.key} pointerEvents="none" style={[s.tick, { left: `${clamp(m.t / dur, 0, 1) * 100}%`, backgroundColor: m.color }]} />
          ))}
          <View pointerEvents="none" style={[s.thumb, { left: `${progress * 100}%` }]} />
        </View>
        <View style={s.timeRow}>
          <Text style={s.time}>{clock(pos)}</Text>
          <Text style={s.time}>{dur > 0 ? clock(dur) : '–:–'}</Text>
        </View>
      </View>

      <View style={s.controls}>
        <IconButton icon="play-skip-back" label="Previous frame" onPress={() => stepFrame(-1)} />
        <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={toggle} filled tint={gradient.brand[1]} />
        <IconButton icon="play-skip-forward" label="Next frame" onPress={() => stepFrame(1)} />
        <View style={{ flex: 1, minWidth: 176 }}>
          <SegmentedControl options={SPEEDS} value={speed} onChange={changeSpeed} />
        </View>
      </View>

      {marks.length > 0 && (
        <View style={s.markers}>
          {marks.map((m) => {
            const on = frame === m.frame;
            return (
              <Pressable key={m.key} onPress={() => jump(m.frame)} accessibilityRole="button" accessibilityLabel={`Jump to ${m.label}, frame ${m.frame}`}
                style={({ pressed }) => [s.marker, on && { borderColor: m.color, backgroundColor: alpha(m.color, 0.14) }, pressed && { opacity: 0.8 }]}>
                <View style={[s.dot, { backgroundColor: m.color }]} />
                <Text style={s.markerText}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: sp(1.5) },
  video: { width: '100%', backgroundColor: '#000', borderRadius: radius.card, overflow: 'hidden' },
  // Web: the style goes straight onto <video>, which needs an explicit size to fill the box.
  fillVideo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  hidden: { opacity: 0 },
  bigPlay: {
    position: 'absolute', top: '50%', left: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32, borderRadius: 32,
    backgroundColor: 'rgba(10, 14, 26, 0.7)', alignItems: 'center', justifyContent: 'center',
  },
  overlayText: { ...font.caption, fontWeight: '700', color: color.text },
  frameBadge: {
    position: 'absolute', left: sp(1), bottom: sp(1), backgroundColor: 'rgba(10, 14, 26, 0.7)', borderRadius: 8,
    paddingHorizontal: sp(1), paddingVertical: 4, overflow: 'hidden', fontVariant: ['tabular-nums'],
  },
  skeletonPill: {
    position: 'absolute', right: sp(1), top: sp(1), flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
    paddingHorizontal: sp(1.5), borderRadius: 18, backgroundColor: 'rgba(10, 14, 26, 0.7)', borderWidth: 1, borderColor: color.border,
  },
  skeletonOn: { backgroundColor: gradient.brand[1], borderColor: gradient.brand[1] },
  scrubWrap: { gap: 2 },
  scrubTouch: { height: 36, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: gradient.brand[1] },
  tick: { position: 'absolute', top: 7, width: 4, height: 22, marginLeft: -2, borderRadius: 2 },
  thumb: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: color.text, borderWidth: 3, borderColor: color.bg },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...font.caption, color: color.muted, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: sp(1) },
  markers: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  marker: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: HIT - 8, paddingHorizontal: sp(1.5),
    borderRadius: radius.chip, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  markerText: { ...font.body, fontSize: 14, fontWeight: '700', color: color.text },
  caption: { ...font.caption, color: color.muted },
});
