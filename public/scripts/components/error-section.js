define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
        Error-Log (<button v-on:click="clear" class="button is-small is-rounded">Clear</button>)
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
    methods: {
      clear: function () {
        this.$store.commit('clearErrors');
      }
    }
  });
});


