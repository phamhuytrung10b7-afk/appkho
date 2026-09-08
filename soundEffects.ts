/**
 * Audio Sound Effects System for Warehouse Scanning & Operations
 * Synthesizes crisp, high-quality tones via Web Audio API without external audio files.
 * Works across desktop browsers and mobile devices (iOS / Android).
 */

class SoundEffectsService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Ting - Ting! (Âm thanh thành công 2 tiếng chuông trong trẻo, vui tươi)
   */
  public playSuccessTingTing(): void {
    try {
      // Haptic feedback for mobile
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([60, 50, 90]);
        } catch {}
      }

      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // --- Ting #1 (Pitch: ~1318.5 Hz - E6) ---
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.51, now); // E6
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.45, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.19);

      // Ting #1 harmonic shimmer (Bell overtone at ~2.76x)
      const harm1 = ctx.createOscillator();
      const harmGain1 = ctx.createGain();
      harm1.type = 'triangle';
      harm1.frequency.setValueAtTime(1318.51 * 2, now);
      harmGain1.gain.setValueAtTime(0, now);
      harmGain1.gain.linearRampToValueAtTime(0.12, now + 0.01);
      harmGain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      harm1.connect(harmGain1);
      harmGain1.connect(ctx.destination);
      harm1.start(now);
      harm1.stop(now + 0.13);

      // --- Ting #2 (Pitch: ~2093 Hz - C7 - Vang cao và dài hơn) ---
      const delay = 0.12; // 120ms sau tiếng Ting 1
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2093.0, now + delay); // C7
      gain2.gain.setValueAtTime(0, now + delay);
      gain2.gain.linearRampToValueAtTime(0.55, now + delay + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + delay);
      osc2.stop(now + delay + 0.39);

      // Ting #2 shimmer
      const harm2 = ctx.createOscillator();
      const harmGain2 = ctx.createGain();
      harm2.type = 'sine';
      harm2.frequency.setValueAtTime(2093.0 * 1.5, now + delay); // G7
      harmGain2.gain.setValueAtTime(0, now + delay);
      harmGain2.gain.linearRampToValueAtTime(0.18, now + delay + 0.01);
      harmGain2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
      harm2.connect(harmGain2);
      harmGain2.connect(ctx.destination);
      harm2.start(now + delay);
      harm2.stop(now + delay + 0.26);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  /**
   * È - è - è! (Âm thanh cảnh báo lỗi 3 tiếng tút trầm, dứt khoát)
   */
  public playErrorBuzzer(): void {
    try {
      // Heavy haptic feedback for mobile error
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([150, 70, 150, 70, 200]);
        } catch {}
      }

      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const numBeeps = 3;
      const beepDuration = 0.1;
      const gap = 0.06;

      for (let i = 0; i < numBeeps; i++) {
        const start = now + i * (beepDuration + gap);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Sawtooth wave for harsh, recognizable error buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, start);
        osc.frequency.exponentialRampToValueAtTime(110, start + beepDuration);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.4, start + 0.01);
        gain.gain.setValueAtTime(0.4, start + beepDuration - 0.015);
        gain.gain.linearRampToValueAtTime(0.001, start + beepDuration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + beepDuration);
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  /**
   * Beep ngắn khi quét trúng mã QR hợp lệ
   */
  public playScanBeep(): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }

      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }
}

export const soundEffects = new SoundEffectsService();
