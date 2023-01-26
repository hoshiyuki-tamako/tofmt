<script setup lang="ts">
import { RouterView } from "vue-router";
import "reflect-metadata";
</script>

<template lang="pug">
el-container
  RouterView
  el-footer
    el-divider
    p
      span Twitter &nbsp;
      el-link(href="https://twitter.com/hoshiyuki_git" target="_blank" rel="noopener" type="primary") @hoshiyuki_git
</template>
