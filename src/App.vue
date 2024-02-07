<script setup lang="ts">
import 'reflect-metadata'
import HomeView from '@/views/HomeView.vue'
</script>

<template lang="pug">
el-container
  HomeView
  el-footer
    el-divider
    p
      span Twitter &nbsp;
      el-link(href="https://twitter.com/hoshiyuki_git" target="_blank" rel="noopener" type="primary") @hoshiyuki_git
</template>
