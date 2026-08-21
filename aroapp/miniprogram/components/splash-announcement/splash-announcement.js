const mpRelease = require('../../utils/mpReleaseHelpers.js');



Component({

  data: {

    visible: false,

    title: '版本更新公告',

    versionCode: '',

    publishedAtText: '',

    contentHtml: '',

    releaseId: null,

  },

  lifetimes: {

    attached: function () {

      var app = getApp();

      if (!app || !app.globalData || app.globalData.splashShownThisSession) return;

      app.globalData.splashShownThisSession = true;

      this.tryShowVersionRelease();

    },

  },

  methods: {

    tryShowVersionRelease: function () {

      var self = this;

      mpRelease.fetchSplashRelease().then(function (release) {

        if (!release || !mpRelease.shouldShowSplashRelease(release)) return;

        self.setData({

          visible: true,

          title: String(release.title || '版本更新公告').trim(),

          versionCode: String(release.versionCode || '').trim(),

          publishedAtText: String(release.publishedAtText || '').trim(),

          contentHtml: mpRelease.prepareReleaseBodyHtml(release),

          releaseId: release.id,

        });

      }).catch(function () {

        /* 首屏版本公告失败不阻塞页面 */

      });

    },

    onClose: function () {

      var releaseId = this.data.releaseId;

      if (releaseId) {

        mpRelease.markReleaseDismissed(releaseId);

      }

      this.setData({ visible: false });

    },

  },

});


