all: remote_sync remote_run

remote_run::
	ssh jeremy@jetson-nano 'cd /home/jeremy/code/kubecon23 && /usr/local/go/bin/go run . -configFile data/yolov4-tiny.cfg -weightsFile data/yolov4-tiny.weights -imageFile data/sample.jpg'

remote_sync::
	rsync -avz --exclude-from '.gitignore' --exclude '.git' --delete -e ssh ./ jeremy@jetson-nano:/home/jeremy/code/kubecon23

