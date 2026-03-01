// Just checking if there's any difference between the two
const propDef = { name: "MyTargetKey", type: "BlackboardKeySelector" };
const isBlackboardKey = propDef?.type === 'BlackboardKey' || propDef?.type === 'BlackboardKeySelector';
console.log(isBlackboardKey);
