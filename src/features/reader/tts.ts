/**
 * Озвучка книги через Web Speech API.
 * Блоки текста озвучиваются последовательно; по boundary-событию
 * подсвечивается текущее слово (charIndex внутри utterance).
 */
export interface TtsCallbacks {
  onWord?: (blockId: string, wordStart: number, wordEnd: number) => void;
  onBlockStart?: (blockId: string) => void;
  onEnd?: () => void;
}

export class TtsController {
  private queue: { id: string; text: string }[] = [];
  private index = 0;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private paused = false;
  private stopped = true;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private cbs: TtsCallbacks = {};
  rate = 1;
  voiceURI = '';

  get isPlaying() {
    return !this.stopped && !this.paused;
  }

  get isPaused() {
    return this.paused;
  }

  start(blocks: { id: string; text: string }[], fromIndex = 0, cbs: TtsCallbacks = {}) {
    this.stop();
    this.queue = blocks;
    this.index = fromIndex;
    this.cbs = cbs;
    this.stopped = false;
    this.paused = false;
    this.speakNext();
  }

  pause() {
    if (this.stopped) return;
    speechSynthesis.pause();
    this.paused = true;
  }

  resume() {
    if (this.stopped) return;
    speechSynthesis.resume();
    this.paused = false;
  }

  stop() {
    this.stopped = true;
    this.paused = false;
    this.queue = [];
    this.index = 0;
    this.currentUtterance = null;
    speechSynthesis.cancel();
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
  }

  /** Таймер сна: остановка через N минут. */
  setSleepTimer(minutes: number | null) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (minutes) {
      this.sleepTimer = setTimeout(() => this.stop(), minutes * 60_000);
    }
  }

  private speakNext() {
    if (this.stopped || this.index >= this.queue.length) {
      this.stopped = true;
      this.cbs.onEnd?.();
      return;
    }
    const block = this.queue[this.index++];
    const u = new SpeechSynthesisUtterance(block.text);
    u.rate = this.rate;
    u.lang = document.documentElement.lang === 'ru' ? 'ru-RU' : 'en-US';
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.voiceURI === this.voiceURI);
    if (v) u.voice = v;

    u.onboundary = (e) => {
      if (e.name === 'word' || e.charIndex !== undefined) {
        // Находим границы слова по charIndex
        const text = block.text;
        let s = e.charIndex;
        let en = s;
        while (en < text.length && !/\s/.test(text[en])) en++;
        while (s > 0 && !/\s/.test(text[s - 1])) s--;
        this.cbs.onWord?.(block.id, s, en);
      }
    };
    u.onend = () => {
      if (!this.stopped) this.speakNext();
    };
    u.onerror = () => {
      if (!this.stopped) this.speakNext();
    };
    this.currentUtterance = u;
    this.cbs.onBlockStart?.(block.id);
    speechSynthesis.speak(u);
  }
}

export const tts = new TtsController();

// Safari/Chrome подгружают голоса асинхронно
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
