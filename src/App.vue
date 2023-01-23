<script setup lang="ts">
import { RouterView } from "vue-router";
import "reflect-metadata";

import "dayjs/locale/zh-tw";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import "dayjs/locale/ja";
</script>

<template lang="pug">
RouterView
el-divider
div
  p
    span Twitter &nbsp;
    el-link(href="https://twitter.com/hoshiyuki_git" target="_blank" rel="noopener" type="primary") @hoshiyuki_git
</template>
