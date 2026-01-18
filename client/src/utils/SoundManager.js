class SoundManager {
    constructor() {
        this.context = null;
        this.masterVolume = 0.5;
        this.initialized = false;
    }

    init() {
        if (!this.initialized) {
            try {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
                this.initialized = true;
            } catch (e) {
                console.error("Web Audio API not supported", e);
            }
        }
        // Resume context if suspended (browser autoplay policy)
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    playTone(frequency, type, duration, startTime = 0, volume = 1) {
        if (!this.initialized) this.init();
        if (!this.context) return;

        const osc = this.context.createOscillator();
        const gainNode = this.context.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.context.currentTime + startTime);

        gainNode.gain.setValueAtTime(volume * this.masterVolume, this.context.currentTime + startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + startTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.context.destination);

        osc.start(this.context.currentTime + startTime);
        osc.stop(this.context.currentTime + startTime + duration);
    }

    playCorrect() {
        // Happy ascending arpeggio
        this.playTone(523.25, 'sine', 0.2, 0, 0.5); // C5
        this.playTone(659.25, 'sine', 0.2, 0.1, 0.5); // E5
        this.playTone(783.99, 'sine', 0.4, 0.2, 0.5); // G5
        this.playTone(1046.50, 'sine', 0.6, 0.3, 0.4); // C6
    }

    playWrong() {
        // Dissonant descending
        this.playTone(300, 'sawtooth', 0.3, 0, 0.3);
        this.playTone(250, 'sawtooth', 0.5, 0.1, 0.3);
    }

    playTick() {
        // Woodblock-ish tick
        this.playTone(800, 'square', 0.05, 0, 0.1);
    }

    playClick() {
        // Simple UI click
        this.playTone(1200, 'sine', 0.05, 0, 0.1);
    }

    playJoin() {
        // Soft bubble pop
        this.playTone(400, 'sine', 0.1, 0, 0.3);
        this.playTone(600, 'sine', 0.1, 0.05, 0.3);
    }

    playWin() {
        // Fanfare
        const now = 0;
        this.playTone(523.25, 'triangle', 0.2, now, 0.6);
        this.playTone(523.25, 'triangle', 0.2, now + 0.2, 0.6);
        this.playTone(523.25, 'triangle', 0.2, now + 0.4, 0.6);
        this.playTone(659.25, 'triangle', 0.6, now + 0.6, 0.6);
    }
}

const soundManager = new SoundManager();
export default soundManager;
