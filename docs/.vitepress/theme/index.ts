import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import './custom.css';

import FeatureCard from './components/FeatureCard.vue';
import ConceptBox from './components/ConceptBox.vue';
import NodeCard from './components/NodeCard.vue';

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('FeatureCard', FeatureCard);
    app.component('ConceptBox', ConceptBox);
    app.component('NodeCard', NodeCard);
  },
};

export default theme;
