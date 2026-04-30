<template>
  <a class="feather-feature-card" :href="href">
    <span class="ff-icon">{{ icon }}</span>
    <div class="ff-title">{{ title }}</div>
    <div class="ff-desc"><slot>{{ desc }}</slot></div>
  </a>
</template>

<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  desc?: string;
  href: string;
}>();
</script>
