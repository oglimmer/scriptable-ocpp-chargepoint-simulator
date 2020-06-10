define(function (require) {
  let Vue = require('libs/vue');
  let axios = require('libs/axios');
  let VueAxios = require('libs/vue-axios');
  let store = require('store');
  require('components/console-input');
  require('components/serverfeed');
  require('components/button-section');
  require('components/topmenu');
  require('components/error-section');

  Vue.use(VueAxios, axios);

  const getUrlParameter = function getUrlParameter(sParam) {
    const sPageURL = window.location.search.substring(1);
    const sURLVariables = sPageURL.split('&');

    for (let i = 0; i < sURLVariables.length; i++) {
      const sParameterName = sURLVariables[i].split('=');

      if (sParameterName[0] === sParam) {
        return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
      }
    }
  };

  new Vue({
    el: '#main',
    store: store,
    created() {
      this.$store.commit('setCpName', getUrlParameter('cp'));
    },
    template: `
      <div>
        <topmenu />
        <consoleInput />
        <buttonSection />
        <serverFeed />
        <errorSection />
      </div>
        `,
  });
});
