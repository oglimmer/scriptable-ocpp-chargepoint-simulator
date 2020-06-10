define(function (require) {
  let Vue = require('libs/vue');

  let template = `
    <nav class="panel">
      <p class="panel-heading">
      Command Helper
    </p>
    <div class="panel-block">
      <button v-on:click="startup" class="button">Startup</button> &nbsp;
      <button v-on:click="bootnotification" class="button">Bootnotification</button> &nbsp;
      <button v-on:click="heartbeat" class="button">heartbeat</button> &nbsp;
      <button v-on:click="statusNotification" class="button">statusNotification</button> &nbsp;
      <button v-on:click="authorize" class="button">authorize</button> &nbsp;
      <button v-on:click="startTransaction" class="button">startTransaction</button> &nbsp;
      <button v-on:click="meterValues" class="button">meterValues</button> &nbsp;
      <button v-on:click="stopTransaction" class="button">stopTransaction</button> &nbsp;
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
      }
    }
  });
});


