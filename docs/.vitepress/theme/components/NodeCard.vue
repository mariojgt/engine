<template>
  <div class="feather-node" :data-kind="kind">
    <div class="fn-head">
      <span class="fn-name">{{ name }}</span>
      <span class="fn-tag">{{ kindLabel }}</span>
    </div>
    <div class="fn-body">
      <slot>{{ desc }}</slot>
      <div class="fn-pins" v-if="(inputs && inputs.length) || (outputs && outputs.length)">
        <div
          v-for="(p, i) in inputs || []"
          :key="'in-'+i"
          class="fn-pin"
          :data-type="p.type"
        >
          <span>{{ p.name }}</span>
          <span class="fn-pin-side">in</span>
        </div>
        <div
          v-for="(p, i) in outputs || []"
          :key="'out-'+i"
          class="fn-pin"
          :data-type="p.type"
        >
          <span>{{ p.name }}</span>
          <span class="fn-pin-side">out</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type Pin = { name: string; type: 'exec' | 'bool' | 'num' | 'str' | 'vec3' | 'color' | 'any' };
type Kind = 'event' | 'flow' | 'action' | 'pure' | 'value' | 'convert';

const props = defineProps<{
  name: string;
  kind: Kind;
  desc?: string;
  inputs?: Pin[];
  outputs?: Pin[];
}>();

const labels: Record<Kind, string> = {
  event: 'Event',
  flow: 'Flow',
  action: 'Action',
  pure: 'Pure',
  value: 'Value',
  convert: 'Convert',
};

const kindLabel = computed(() => labels[props.kind] ?? props.kind);
</script>
