
// 解決Safari播放延遲問題
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

let AudioPlayer = function () {
    let self = this;
    let audio = new Audio();
    let isLoop = false;
    let isPlay = false;
    let isEndOfPlay = false;
    let isNeedReplay = false;

    // 定義內部監聽器（'名稱': 監聽器方法名）
    let insideListener = {
        loadeddata: onLoadeddata,
        timeupdate: onTimeupdate,
        play: onPlay,
        pause: onPause
    };
    setInsideListener();
    // 外部監聽器陣列
    let outsideListener = {
        loaded: [],
        playFromStart: [],
        playToEnd: [],
        pausePlayback: []
    }

    // MP3頭尾空白
    let mp3BeginGap = .010;
    let mp3EndGap = .010;

    //固定、加總間隔（不需修改）
    let fixedBeginGap = .014;
    let fixedEndGap = .2;
    let allBeginGap = mp3BeginGap + fixedBeginGap;
    let allEndGap = mp3EndGap + fixedEndGap;

    let duration;

    this.setAudio = function (audioSrc, beginGap = .010, endGap = .010) {
        isNeedReplay = false;
        if (isPlay) {
            self.stop();
            isNeedReplay = true;
        }
        audio.src = audioSrc;
        mp3BeginGap = beginGap;
        mp3EndGap = endGap;
        allBeginGap = mp3BeginGap + fixedBeginGap;
        allEndGap = mp3EndGap + fixedEndGap;
    }

    this.play = function () {
        audio.play();
    }
    this.pause = function () {
        audio.pause();
    }
    this.stop = function () {
        self.pause();
        audio.currentTime = allBeginGap;
    }
    this.playOrStop = function () {
        if (isPlay) {
            self.stop();
            return;
        }
        self.play();
    }

    this.isPlay = function () {
        return isPlay;
    }
    this.isLoop = function () {
        return isLoop;
    }
    this.setLoop = function (bool = true) {
        isLoop = bool;
    }
    this.getDuration = function () {
        return duration;
    }

    function setInsideListener() {
        Object.keys(insideListener).forEach(listenerName => {
            audio.addEventListener(listenerName, (event) => {
                insideListener[listenerName]();
            });
        });
    }

    function callOutsideListener(ListenerArray) {
        ListenerArray.forEach(listener => listener());
    }

    function onLoadeddata() {
        audio.currentTime = allBeginGap;
        duration = audio.duration - allBeginGap - allEndGap;
        callOutsideListener(outsideListener.loaded);
        if (isNeedReplay) {
            isNeedReplay = false;
            // 進行重放
            self.play();
        }
    }

    function onTimeupdate() {
        let currentTime = audio.currentTime;
        let duration = audio.duration;
        // 判斷播放到最後
        if (currentTime >= duration - allEndGap) {
            callOutsideListener(outsideListener.playToEnd);
            if (isLoop) {
                // 從頭播放
                audio.currentTime = allBeginGap;
                self.play();
                callOutsideListener(outsideListener.playFromStart);
            } else {
                // 結束播放
                isEndOfPlay = true;
                self.stop();
            }
            // 判斷再1秒到最後（高速迴圈做精確判斷）
        } else if (currentTime + 1 >= duration - allEndGap) {
            requestAnimationFrame(onTimeupdate.bind(this));
        }
    }

    function onPlay() {
        isPlay = true;
        isEndOfPlay = false;
        callOutsideListener(outsideListener.playFromStart);
    }

    function onPause() {
        isPlay = false;
        if (isEndOfPlay) return;
        callOutsideListener(outsideListener.pausePlayback);
    }

    // 新增外部監聽隊列
    this.addOnLoadedListener = function (func) {
        outsideListener.loaded.push(func);
    }
    this.addOnPlayFromStartListener = function (func) {
        outsideListener.playFromStart.push(func);
    }
    this.addOnPlayToEndListener = function (func) {
        outsideListener.playToEnd.push(func);
    }
    this.addOnPausePlaybackListener = function (func) {
        outsideListener.pausePlayback.push(func);
    }
}
