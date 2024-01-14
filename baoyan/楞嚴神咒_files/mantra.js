
//mantra播放
let MantraPlayer = function() {
    let mantraWheel;
    let mantraText;
    let mantraTextAnimePath = {
        start: '120px',
        end: '-450px'
    };
    let mp3ChantNum;
    let animeDuration;

    // 播放器
    let player = new AudioPlayer();
    this.playOrStop = player.playOrStop;
    this.setLoop = player.setLoop;

    this.setAudio = function (audioSrc, chantNum = 1, beginGap = .010, endGap = .010) {
        mp3ChantNum = chantNum;
        player.setAudio(audioSrc, beginGap, endGap);
    }


    // 計數器
    let counter = new MantraCounter();

    this.setMantraCounterPostApiNameAndUrl = function (name, url) {
        counter.setPostApiNameAndUrl(name, url);
    }

    this.addMantraCounterListener = function (func) {
        counter.addListener(func);
    }


    // 動畫
    this.setAnimeElement = function () {
        mantraWheel = document.querySelector('#mantra-wheel-spin');
        mantraText = document.querySelector('#mantra-text');
        mantraText.style.marginLeft = mantraTextAnimePath.start;
    }

    this.setMantraTextAnimeEndPoint = function (endPoint) {
        mantraTextAnimePath.end = endPoint + 'px';
    }

    function setAnimeDuration() {
        animeDuration = (player.getDuration() * 1000 + 70) / mp3ChantNum;
    }

    function startAnime() {
        mantraWheel.velocity('stop');
        mantraText.velocity('stop', true);

        let options = {
            duration: animeDuration,
            easing: 'linear',
            repeat: mp3ChantNum - 1
        };
      let optionsMantraWheel = {
        duration: animeDuration / 15,
        easing: 'linear',
        repeat: 15
      };
        let addCountOptions = {};
        let addCountNum = 0;

        Object.assign(addCountOptions, optionsMantraWheel,{
            progress: function(elements, percentComplete, timeRemaining, timeStart) {
                if (percentComplete !== 1) return;
                addCountNum++;
                if (addCountNum === mp3ChantNum) return;
                // 多片段音檔的途中次數+1
                counter.addCount();
            }
        });

        mantraWheel.velocity({
            transform: ['rotateZ(360deg)', 'rotateZ(0deg)']
        }, addCountOptions);

        mantraText.velocity({
            marginLeft: [mantraTextAnimePath.end, mantraTextAnimePath.start]
        }, options).velocity({
            marginLeft: mantraTextAnimePath.start
        }, { duration: 0 });
    }

    function stopAnime() {
        let options = {
            duration: 100
        };

        mantraWheel.velocity('stop').velocity({
            transform: ['rotateZ(0deg)']
        }, options);

        mantraText.velocity('stop', true).velocity({
            marginLeft: mantraTextAnimePath.start
        }, options);
    }

    // 綁定播放器事件
    // (因為鍵盤播放鍵的關係，全部由播放器事件來驅動才不會出錯)
    player.addOnLoadedListener(setAnimeDuration);
    player.addOnPlayFromStartListener(startAnime);
    player.addOnPausePlaybackListener(player.stop);// 暫停=從頭
    player.addOnPausePlaybackListener(stopAnime);
    player.addOnPlayToEndListener(counter.addCount);
}


//mantra計數
let MantraCounter = function () {
    let self = this;
    let postUrl = null;
    let saveName = '';
    let listener = [];
    this.count = 0;
    this.grandTotal = 0;
    this.worldTotal = 0;

    this.setPostApiNameAndUrl = function (name, url) {
        saveName = name;
        postUrl = url;
        this.loadCount();
    }

    //讀取舊數據
    this.loadCount = function () {
        cookieLoad();
        postAndGetCount();
        self.count = 0;
        cookieSave();
        notifyListener();
    }

    //增加本次計數
    this.addCount = function (n = 1) {
        cookieLoad();
        self.count += n;
        self.grandTotal += n;
        self.worldTotal += n;
        postAndGetCount(n);
        cookieSave();
        notifyListener();
    }

    //上傳增加數字/返回世界總數
    function postAndGetCount(n = 0) {
        if (postUrl == null) return;
        axios.post(postUrl, {
            name: saveName,
            count: n
        })
            .then(response => {
                cookieLoad();
                self.worldTotal = response.data['count'];
                cookieSave();
                notifyListener();
            })
            .catch(error => {
            });
    }

    //cookie本地儲存用
    function cookieSave() {
        Cookies.set(saveName + '_mantraCount', self.count);
        Cookies.set(saveName + '_mantraGrandTotal', self.grandTotal);
        Cookies.set(saveName + '_mantraWorldTotal', self.worldTotal);
    }
    function cookieLoad() {
        self.count = parseInt(Cookies.get(saveName + '_mantraCount')) || 0;
        self.grandTotal = parseInt(Cookies.get(saveName + '_mantraGrandTotal')) || 0;
        self.worldTotal = parseInt(Cookies.get(saveName + '_mantraWorldTotal')) || 0;
    }

    // 監聽器
    this.addListener = function (func) {
        listener.push(func);
        notifyListener();
    }

    function notifyListener() {
        let data = {
            count: self.count,
            grandTotal: self.grandTotal,
            worldTotal: self.worldTotal
        };
        listener.forEach(listener => listener(data));
    }
}
