define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
      Command Helper (<button v-on:click="openDocs" class="button is-small is-rounded">Docs</button>)
    </p>
    <div class="panel-block">
      <button v-on:click="startup" class="button is-primary">Startup</button> &nbsp;
      <button v-on:click="bootnotification" class="button is-link">Bootnotification</button> &nbsp;
      <button v-on:click="heartbeat" class="button is-link">heartbeat</button> &nbsp;
      <button v-on:click="statusNotification" class="button is-link">statusNotification</button> &nbsp;
      <button v-on:click="authorize" class="button is-info">authorize</button> &nbsp;
      <button v-on:click="startTransaction" class="button is-info">startTransaction</button> &nbsp;
      <button v-on:click="meterValues" class="button is-info">meterValues</button> &nbsp;
      <button v-on:click="stopTransaction" class="button is-info">stopTransaction</button> &nbsp;
      </div>
    </nav>
`;
  Vue.component('buttonSection', {
    props: [],
    template: template,
    methods: {
      startup: function() {
        this.$store.commit('startup');
      },
      bootnotification: function() {
        this.$store.commit('bootnotification');
      },
      heartbeat: function() {
        this.$store.commit('heartbeat');
      },
      statusNotification: function() {
        this.$store.commit('statusNotification');
      },
      authorize: function() {
        this.$store.commit('authorize');
      },
      startTransaction: function() {
        this.$store.commit('startTransaction');
      },
      meterValues: function() {
        this.$store.commit('meterValues');
      },
      stopTransaction: function() {
        this.$store.commit('stopTransaction');
      },
      openDocs: function () {
        window.open('docs', '_blank');
      }
    }
  });
});


