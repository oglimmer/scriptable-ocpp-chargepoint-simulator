define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
        OCPP communication log (
          <button v-on:click="clear" class="button is-small is-rounded">Clear</button>
          <label class="checkbox">
            <input type="checkbox" id="checkbox" v-model="hideHeartbeats">
            Hide Heartbeats
          </label>
          )
      </p>
      <div class="panel-block" v-for="msg in ocppMessages">
            <span class="tag is-danger">{{ msg.action }}</span> &nbsp;
            <span class="tag is-success">{{ msg.request.payload }}</span> &nbsp;
            <span class="tag is-info">{{ msg.answer.payload }}</span>
      </div>
    </nav>
`;
  Vue.component('serverFeed', {
    props: [],
    template: template,
    data() {
      return {
        ws: null
      }
    },
    computed: {
      ocppMessages() {
        return this.$store.state.ocppMessages.filter(e => !this.$store.state.hideHeartbeats ? true : e.action != 'Heartbeat');
      },
      hideHeartbeats: {
        get() {
          return this.$store.state.hideHeartbeats;
        },
        set(value) {
          this.$store.commit('hideHeartbeats', value);
        }
      }
    },
    created() {
      const url = `ws://localhost:${parseInt(window.location.port) + 1}/${this.$store.state.cpName}`;
      this.ws = new WebSocket(url);
      this.ws.onmessage = this.onMessage;
    },
    methods: {
      onMessage: function(event) {
        const data = JSON.parse(event.data);
        //console.log(data);
        if(data.type == 0) {
          this.$store.commit('ocppMessages', data.payload);
        } else if(data.type == 1) {
          this.$store.commit('updateWsStatus', data.payload);
        } else if(data.type == 2) {
          this.$store.commit('updateWsError', data.payload);
        }
      },
      clear: function() {
        this.$store.commit('clearOcppMessages');
      }
    }
  });
});
