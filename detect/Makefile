all: remote_sync remote_run

remote_run::
	ssh jeremy@orin-nano 'cd /home/jeremy/code/kubecon23 && /usr/local/go/bin/go run . -configFile data/yolov4-tiny.cfg -weightsFile data/yolov4-tiny.weights -imageFile data/sample.jpg'

remote_sync::
	rsync -avz --exclude-from '../.gitignore' --delete -e ssh ./ jeremy@orin-nano:/home/jeremy/code/kubecon23

setup::
	sudo jetson_clocks && sudo nvpmodel -m 0

leaf:
	nats-server -c leaf.conf
