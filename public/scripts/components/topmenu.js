define(function (require) {
  let Vue = require('libs/vue');

  Vue.component('topmenu', {
    props: [],
    computed: {
      wsStatus() {
        return this.$store.state.wsStatus;
      }
    },
    template: `
      <div>
        <nav class="navbar" role="navigation" aria-label="main navigation">
          <div class="navbar-brand">
            <a class="navbar-item" href="https://github.com/oglimmer/">
              OCPP 1.6J ChargePoint - Remote console
            </a>
          </div>
          <div class="navbar-end">
            <div class="navbar-item">
              <div>
                WS to central system: {{ wsStatus }}
              </div>
            </div>
          </div>
        </nav>
        <div>
`,
  });
});
