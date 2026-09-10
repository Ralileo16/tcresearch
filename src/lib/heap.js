export class MinHeap {
	constructor(compare) {
		this.compare = compare;
		this.data = [];
	}

	get size() {
		return this.data.length;
	}

	push(item) {
		const data = this.data;
		data.push(item);
		let i = data.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.compare(data[i], data[parent]) >= 0) break;
			[data[i], data[parent]] = [data[parent], data[i]];
			i = parent;
		}
	}

	pop() {
		const data = this.data;
		if (data.length === 0) return undefined;
		const top = data[0];
		const last = data.pop();
		if (data.length > 0) {
			data[0] = last;
			let i = 0;
			for (;;) {
				const left = 2 * i + 1;
				const right = 2 * i + 2;
				let smallest = i;
				if (left < data.length && this.compare(data[left], data[smallest]) < 0) smallest = left;
				if (right < data.length && this.compare(data[right], data[smallest]) < 0) smallest = right;
				if (smallest === i) break;
				[data[i], data[smallest]] = [data[smallest], data[i]];
				i = smallest;
			}
		}
		return top;
	}
}