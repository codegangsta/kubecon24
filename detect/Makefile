all: remote_sync remote_run

run::
	go run .

run_leaf::
	go run . 192.168.3.1

remote_run::
	ssh jeremy@192.168.3.2 'cd /home/jeremy/code/kubecon24 && /usr/local/go/bin/go run .'

ssh::
	TERM=xterm ssh jeremy@192.168.3.2

remote_sync::
	rsync -avz --exclude-from '../.gitignore' --delete -e ssh ./ jeremy@192.168.3.2:/home/jeremy/code/kubecon24

setup::
	sudo jetson_clocks && sudo nvpmodel -m 0

leaf:
	nats-server -c leaf.conf
