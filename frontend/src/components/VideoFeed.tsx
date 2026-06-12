import { useEffect, useRef } from 'react';
import { poseEngine, VIDEO_WIDTH, VIDEO_HEIGHT } from '../vision/poseEngine';
import { drawSkeleton } from '../vision/skeleton';

interface VideoFeedProps {
  width: number;
  /** Draw the pose skeleton overlay (default true). */
  skeleton?: boolean;
  className?: string;
}

/**
 * Paints the (mirrored) webcam feed plus skeleton overlay onto a canvas at
 * display resolution. Mirroring makes the preview behave like a mirror,
 * which is what people instinctively expect when boxing at a camera.
 */
export function VideoFeed({ width, skeleton = true, className }: VideoFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * VIDEO_HEIGHT) / VIDEO_WIDTH);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const scale = width / VIDEO_WIDTH;

    const paint = () => {
      raf = requestAnimationFrame(paint);
      const video = poseEngine.getVideo();
      ctx.fillStyle = '#1c1916';
      ctx.fillRect(0, 0, width, height);
      if (video && video.readyState >= 2) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
      }
      if (skeleton) {
        drawSkeleton(ctx, poseEngine.latestKeypoints, scale, width);
      }
    };
    paint();

    return () => cancelAnimationFrame(raf);
  }, [width, height, skeleton]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className ? `video-feed ${className}` : 'video-feed'}
    />
  );
}
