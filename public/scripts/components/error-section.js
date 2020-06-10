define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
        Error-Log
      </p>
      <div class="panel-block" v-for="err in wsError">
        {{ err }}
      </div>
    </nav>
`;
  Vue.component('errorSection', {
    props: [],
    template: template,
    computed: {
      wsError() {
        return this.$store.state.wsError;
      }
    },
  });
});


