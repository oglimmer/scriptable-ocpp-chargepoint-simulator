define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
        JavaScript scripting
      </p>
      <a class="panel-block is-active">
        <textarea class="textarea" rows="15" withspellcheck="false" v-model="inputText"></textarea>
      </a>
      <div class="panel-block">
        <button class="button is-fullwidth is-primary" v-on:click="sendToServer" >
          Send to server
        </button>
      </div>
    </nav>
`;
  Vue.component('consoleInput', {
    props: [],
    template: template,
    computed: {
      inputText: {
        get() {
          return this.$store.state.inputText
        },
        set(value) {
          this.$store.commit('updateInputText', value)
        }
      }
    },
    methods: {
      sendToServer: function () {
        this.$store.dispatch('sendToServer');
      }
    }
  });
});
