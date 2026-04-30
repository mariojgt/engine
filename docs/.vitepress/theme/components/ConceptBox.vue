<template>
  <div class="feather-concept" :data-tone="tone">
    <div class="fc-icon">{{ icon }}</div>
    <div>
      <div class="fc-title">{{ title }}</div>
      <div class="fc-body"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  tone?: 'purple' | 'cyan' | 'mint' | 'amber' | 'pink' | 'red';
}>();
</script>
